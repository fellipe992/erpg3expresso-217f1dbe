package br.com.g3expresso.motorista

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Foreground Service 100% nativo de rastreamento.
 *
 * Regras de operação (nunca depender do WebView / do motorista abrir o app):
 * - Posições vêm do FusedLocationProviderClient e vão direto ao banco (REST).
 * - Cada posição carrega `created_at` do momento da captura: o que ficar em fila
 *   offline é gravado com a hora real em que o motorista passou pelo ponto.
 * - Sem internet: a posição vai para uma fila persistente (SharedPreferences).
 * - Watchdog a cada 60s: reenvia a fila, reanexa o LocationCallback se o sistema
 *   o matou e reagenda o alarme de auto-recuperação.
 * - NetworkCallback: assim que qualquer rede volta, a fila é despejada na hora.
 * - AlarmManager + BOOT_COMPLETED: se o processo for morto (bateria acabou,
 *   celular reiniciou, sistema matou o app), o serviço volta sozinho enquanto
 *   houver viagem em andamento salva.
 * - O serviço só para de verdade em ACTION_STOP (motorista finalizou a viagem).
 */
class G3TrackingService : Service() {

  companion object {
    const val ACTION_START = "br.com.g3expresso.motorista.TRACK_START"
    const val ACTION_STOP = "br.com.g3expresso.motorista.TRACK_STOP"
    const val ACTION_UPDATE_SESSION = "br.com.g3expresso.motorista.TRACK_SESSION"
    /** Disparado pelo AlarmManager / BootReceiver para religar o serviço. */
    const val ACTION_REVIVE = "br.com.g3expresso.motorista.TRACK_REVIVE"

    private const val TAG = "G3Tracking"
    private const val CHANNEL_ID = "g3_viagem_tracking"
    private const val NOTIF_ID = 4211
    private const val PREFS = "g3_tracking_prefs"
    private const val WATCHDOG_MS = 60_000L
    private const val REVIVE_MS = 5 * 60_000L
    private const val QUEUE_MAX = 5000

    @Volatile
    var isRunning: Boolean = false
      private set

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Existe viagem ativa salva? Usado pelo BootReceiver. */
    fun hasActiveTrip(ctx: Context): Boolean {
      val p = prefs(ctx)
      val url = p.getString("supabaseUrl", "") ?: ""
      val viagens = JSONArray(p.getString("viagens", "[]"))
      return url.isNotEmpty() && viagens.length() > 0
    }

    fun reviveIntent(ctx: Context): Intent =
      Intent(ctx, G3TrackingService::class.java).setAction(ACTION_REVIVE)

    fun startIfActive(ctx: Context) {
      if (!hasActiveTrip(ctx)) return
      val intent = reviveIntent(ctx)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
    }
  }

  private lateinit var fused: FusedLocationProviderClient
  private var callback: LocationCallback? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var netCallback: ConnectivityManager.NetworkCallback? = null
  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()
  private val http = OkHttpClient.Builder()
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .retryOnConnectionFailure(true)
    .build()
  private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }

  // Configuração vinda do JS (persistida para sobreviver a restart do serviço).
  private var supabaseUrl = ""
  private var apiKey = ""
  private var accessToken = ""
  private var refreshToken = ""
  private var viagens = JSONArray() // [{id, motorista_id, veiculo_id}]
  private var intervalMs = 20_000L
  private var minDistanceM = 0f

  override fun onCreate() {
    super.onCreate()
    fused = LocationServices.getFusedLocationProviderClient(this)
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopTracking(clearState = true)
        return START_NOT_STICKY
      }
      ACTION_UPDATE_SESSION -> {
        intent.getStringExtra("accessToken")?.let { if (it.isNotEmpty()) accessToken = it }
        intent.getStringExtra("refreshToken")?.let { if (it.isNotEmpty()) refreshToken = it }
        intent.getStringExtra("viagens")?.let { viagens = JSONArray(it) }
        persist()
        // Sessão renovada é a hora ideal para tentar esvaziar a fila.
        io.execute { flushQueue() }
        return START_STICKY
      }
      else -> {
        if (intent != null && intent.hasExtra("supabaseUrl")) {
          supabaseUrl = intent.getStringExtra("supabaseUrl") ?: ""
          apiKey = intent.getStringExtra("apiKey") ?: ""
          accessToken = intent.getStringExtra("accessToken") ?: ""
          refreshToken = intent.getStringExtra("refreshToken") ?: ""
          viagens = JSONArray(intent.getStringExtra("viagens") ?: "[]")
          intervalMs = intent.getLongExtra("intervalMs", 20_000L)
          minDistanceM = intent.getFloatExtra("minDistanceM", 0f)
          persist()
        } else {
          // Reinício pelo sistema / alarme / boot: recupera o estado salvo.
          restore()
          if (supabaseUrl.isEmpty() || viagens.length() == 0) {
            stopSelf()
            return START_NOT_STICKY
          }
        }
        startForegroundNotification()
        startTracking()
        return START_STICKY
      }
    }
  }

  // ---------------------------------------------------------------- tracking

  private fun startTracking() {
    isRunning = true
    acquireWakeLock()
    registerNetworkCallback()
    scheduleWatchdog()
    scheduleRevive()
    requestUpdates()
    io.execute { flushQueue() }
  }

  private fun requestUpdates() {
    if (callback != null) return

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateIntervalMillis(intervalMs / 2)
      .setMinUpdateDistanceMeters(minDistanceM)
      .setWaitForAccurateLocation(false)
      .build()

    val cb = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        val loc = result.lastLocation ?: return
        val capturedAt = if (loc.time > 0) loc.time else System.currentTimeMillis()
        io.execute {
          sendLocation(loc.latitude, loc.longitude, loc.accuracy, loc.speed, loc.bearing, capturedAt)
        }
      }
    }
    callback = cb

    try {
      fused.requestLocationUpdates(request, cb, Looper.getMainLooper())
      Log.i(TAG, "requestLocationUpdates ativo (interval=${intervalMs}ms)")
    } catch (e: SecurityException) {
      Log.e(TAG, "sem permissão de localização", e)
      callback = null
    }
  }

  /**
   * Watchdog: o Android pode remover silenciosamente as atualizações de
   * localização (doze, troca de provider, GPS desligado e religado). A cada
   * minuto reanexamos o callback e tentamos esvaziar a fila offline.
   */
  private val watchdog = object : Runnable {
    override fun run() {
      if (!isRunning) return
      requestUpdates()
      io.execute { flushQueue() }
      scheduleRevive()
      main.postDelayed(this, WATCHDOG_MS)
    }
  }

  private fun scheduleWatchdog() {
    main.removeCallbacks(watchdog)
    main.postDelayed(watchdog, WATCHDOG_MS)
  }

  /** Alarme de auto-recuperação: se o processo morrer, o serviço volta sozinho. */
  private fun scheduleRevive() {
    val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = PendingIntent.getBroadcast(
      this,
      991,
      Intent(this, G3BootReceiver::class.java).setAction(ACTION_REVIVE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    try {
      am.setAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        SystemClock.elapsedRealtime() + REVIVE_MS,
        pi,
      )
    } catch (e: Exception) {
      Log.w(TAG, "não foi possível agendar alarme de recuperação", e)
    }
  }

  /** Rede voltou → despeja a fila imediatamente. */
  private fun registerNetworkCallback() {
    if (netCallback != null) return
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val cb = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        Log.i(TAG, "rede disponível — reenviando fila")
        io.execute { flushQueue() }
      }
    }
    netCallback = cb
    try {
      cm.registerNetworkCallback(
        NetworkRequest.Builder()
          .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
          .build(),
        cb,
      )
    } catch (e: Exception) {
      netCallback = null
      Log.w(TAG, "não foi possível observar a rede", e)
    }
  }

  private fun stopTracking(clearState: Boolean) {
    callback?.let { fused.removeLocationUpdates(it) }
    callback = null
    isRunning = false
    main.removeCallbacks(watchdog)
    unregisterNetworkCallback()
    releaseWakeLock()
    if (clearState) {
      cancelRevive()
      prefs(this).edit().clear().apply()
    }
    stopForeground(true)
    stopSelf()
  }

  private fun cancelRevive() {
    val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = PendingIntent.getBroadcast(
      this,
      991,
      Intent(this, G3BootReceiver::class.java).setAction(ACTION_REVIVE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    try {
      am.cancel(pi)
    } catch (_: Exception) {
    }
  }

  private fun unregisterNetworkCallback() {
    netCallback?.let {
      try {
        (getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager)
          .unregisterNetworkCallback(it)
      } catch (_: Exception) {
      }
    }
    netCallback = null
  }

  /** App fechado pelo motorista: o rastreamento continua e o serviço é religado. */
  override fun onTaskRemoved(rootIntent: Intent?) {
    if (isRunning || hasActiveTrip(this)) startIfActive(this)
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    callback?.let { fused.removeLocationUpdates(it) }
    callback = null
    main.removeCallbacks(watchdog)
    unregisterNetworkCallback()
    // Só encerra de vez quando não há mais viagem salva (ACTION_STOP limpa o estado).
    if (isRunning && hasActiveTrip(this)) startIfActive(this)
    isRunning = false
    releaseWakeLock()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // -------------------------------------------------------------- supabase

  private fun sendLocation(
    lat: Double,
    lon: Double,
    acc: Float,
    speed: Float,
    bearing: Float,
    capturedAt: Long,
  ) {
    if (supabaseUrl.isEmpty() || viagens.length() == 0) return

    val bateria = try {
      (getSystemService(Context.BATTERY_SERVICE) as BatteryManager)
        .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    } catch (_: Exception) {
      null
    }
    val online = isOnline()
    val timestamp = iso.format(Date(capturedAt))

    val rows = JSONArray()
    for (i in 0 until viagens.length()) {
      val v = viagens.optJSONObject(i) ?: continue
      rows.put(JSONObject().apply {
        put("viagem_id", v.optString("id"))
        putOrNull("motorista_id", v.optString("motorista_id", ""))
        putOrNull("veiculo_id", v.optString("veiculo_id", ""))
        put("latitude", lat)
        put("longitude", lon)
        put("precisao", acc.toDouble())
        put("velocidade", speed.toDouble())
        put("heading", bearing.toDouble())
        if (bateria != null && bateria >= 0) put("bateria", bateria)
        put("online", online)
        put("created_at", timestamp)
      })
    }
    if (rows.length() == 0) return

    if (!online) {
      enqueue(rows)
      return
    }

    if (!post(rows) && !lastRejectPermanent) enqueue(rows)
    flushQueue()
  }

  /**
   * Reenvia tudo o que ficou pendente sem internet, em lotes, preservando a
   * fila caso a rede ainda esteja instável.
   */
  private fun flushQueue() {
    if (supabaseUrl.isEmpty()) return
    var pending = JSONArray(prefs(this).getString("queue", "[]"))
    if (pending.length() == 0) return
    if (!isOnline()) return

    while (pending.length() > 0) {
      val batch = JSONArray()
      val rest = JSONArray()
      for (i in 0 until pending.length()) {
        if (i < 100) batch.put(pending.get(i)) else rest.put(pending.get(i))
      }
      val ok = post(batch)
      if (!ok && !lastRejectPermanent) return // continua offline: mantém a fila intacta
      prefs(this).edit().putString("queue", rest.toString()).apply()
      pending = rest
    }
    Log.i(TAG, "fila offline esvaziada")
  }

  private fun isOnline(): Boolean {
    return try {
      val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
      caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    } catch (_: Exception) {
      true
    }
  }

  /** true quando a última recusa do banco é definitiva (não deve ser reenfileirada). */
  @Volatile private var lastRejectPermanent = false

  /** POST /rest/v1/viagem_localizacoes — renova o token e tenta de novo se 401. */
  private fun post(rows: JSONArray, retried: Boolean = false): Boolean {
    if (!retried) lastRejectPermanent = false
    val req = Request.Builder()
      .url("$supabaseUrl/rest/v1/viagem_localizacoes")
      .addHeader("apikey", apiKey)
      .addHeader("Authorization", "Bearer $accessToken")
      .addHeader("Content-Type", "application/json")
      .addHeader("Prefer", "return=minimal")
      .post(rows.toString().toRequestBody("application/json".toMediaType()))
      .build()
    return try {
      http.newCall(req).execute().use { res ->
        when {
          res.isSuccessful -> true
          res.code == 401 && !retried && refreshSession() -> post(rows, true)
          else -> {
            val body = res.body?.string().orEmpty()
            if (res.code == 403 && body.contains("row-level security", ignoreCase = true)) {
              lastRejectPermanent = true
              Log.w(TAG, "insert recusado por RLS — viagem provavelmente encerrada")
            } else {
              Log.w(TAG, "insert falhou ${res.code}: $body")
            }
            false
          }
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "insert erro de rede", e)
      false
    }
  }

  private fun refreshSession(): Boolean {
    if (refreshToken.isEmpty()) return false
    val body = JSONObject().put("refresh_token", refreshToken).toString()
    val req = Request.Builder()
      .url("$supabaseUrl/auth/v1/token?grant_type=refresh_token")
      .addHeader("apikey", apiKey)
      .addHeader("Content-Type", "application/json")
      .post(body.toRequestBody("application/json".toMediaType()))
      .build()
    return try {
      http.newCall(req).execute().use { res ->
        val text = res.body?.string() ?: return false
        if (!res.isSuccessful) {
          Log.w(TAG, "refresh falhou ${res.code}")
          return false
        }
        val json = JSONObject(text)
        accessToken = json.optString("access_token", accessToken)
        refreshToken = json.optString("refresh_token", refreshToken)
        persist()
        true
      }
    } catch (e: Exception) {
      Log.w(TAG, "refresh erro de rede", e)
      false
    }
  }

  // ------------------------------------------------------- fila offline

  private fun enqueue(rows: JSONArray) {
    val queue = JSONArray(prefs(this).getString("queue", "[]"))
    for (i in 0 until rows.length()) queue.put(rows.get(i))
    val trimmed = if (queue.length() > QUEUE_MAX) {
      JSONArray().also { out ->
        for (i in queue.length() - QUEUE_MAX until queue.length()) out.put(queue.get(i))
      }
    } else queue
    prefs(this).edit().putString("queue", trimmed.toString()).apply()
  }

  // ------------------------------------------------------------ persistência

  private fun persist() {
    prefs(this).edit()
      .putString("supabaseUrl", supabaseUrl)
      .putString("apiKey", apiKey)
      .putString("accessToken", accessToken)
      .putString("refreshToken", refreshToken)
      .putString("viagens", viagens.toString())
      .putLong("intervalMs", intervalMs)
      .putFloat("minDistanceM", minDistanceM)
      .apply()
  }

  private fun restore() {
    val p = prefs(this)
    supabaseUrl = p.getString("supabaseUrl", "") ?: ""
    apiKey = p.getString("apiKey", "") ?: ""
    accessToken = p.getString("accessToken", "") ?: ""
    refreshToken = p.getString("refreshToken", "") ?: ""
    viagens = JSONArray(p.getString("viagens", "[]"))
    intervalMs = p.getLong("intervalMs", 20_000L)
    minDistanceM = p.getFloat("minDistanceM", 0f)
  }

  // ------------------------------------------------------- notificação / wake

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java)
    if (mgr.getNotificationChannel(CHANNEL_ID) != null) return
    val ch = NotificationChannel(
      CHANNEL_ID,
      "Viagem em andamento",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Mantém o rastreamento da viagem ativo"
      setShowBadge(false)
    }
    mgr.createNotificationChannel(ch)
  }

  private fun startForegroundNotification() {
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Viagem em andamento")
      .setContentText("G3 Motorista está registrando sua localização.")
      .setSmallIcon(R.drawable.ic_stat_notify)
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(open)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    startForeground(NOTIF_ID, notif)
  }

  private fun acquireWakeLock() {
    if (wakeLock != null) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "G3Motorista::tracking").apply {
      setReferenceCounted(false)
      acquire()
    }
  }

  private fun releaseWakeLock() {
    try {
      wakeLock?.let { if (it.isHeld) it.release() }
    } catch (_: Exception) {
    }
    wakeLock = null
  }
}

private fun JSONObject.putOrNull(key: String, value: String) {
  if (value.isEmpty() || value == "null") put(key, JSONObject.NULL) else put(key, value)
}
