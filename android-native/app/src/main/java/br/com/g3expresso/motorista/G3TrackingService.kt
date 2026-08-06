package br.com.g3expresso.motorista

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
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
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Foreground Service 100% nativo de rastreamento.
 *
 * - Recebe posições do FusedLocationProviderClient (LocationCallback nativo).
 * - Envia CADA posição direto para o Supabase (REST) por OkHttp, sem depender
 *   do WebView / JavaScript, que o Android congela em segundo plano.
 * - Renova o access_token sozinho usando o refresh_token (o token do Supabase
 *   expira em ~1h e a viagem pode durar o dia inteiro).
 * - Guarda em fila local (SharedPreferences) o que falhar por falta de rede e
 *   reenvia na próxima posição.
 *
 * O React só chama start/stop. Nada mais.
 */
class G3TrackingService : Service() {

  companion object {
    const val ACTION_START = "br.com.g3expresso.motorista.TRACK_START"
    const val ACTION_STOP = "br.com.g3expresso.motorista.TRACK_STOP"
    const val ACTION_UPDATE_SESSION = "br.com.g3expresso.motorista.TRACK_SESSION"

    private const val TAG = "G3Tracking"
    private const val CHANNEL_ID = "g3_viagem_tracking"
    private const val NOTIF_ID = 4211
    private const val PREFS = "g3_tracking_prefs"

    @Volatile
    var isRunning: Boolean = false
      private set

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  }

  private lateinit var fused: FusedLocationProviderClient
  private var callback: LocationCallback? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val io = Executors.newSingleThreadExecutor()
  private val http = OkHttpClient.Builder()
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .build()

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
        stopTracking()
        return START_NOT_STICKY
      }
      ACTION_UPDATE_SESSION -> {
        intent.getStringExtra("accessToken")?.let { if (it.isNotEmpty()) accessToken = it }
        intent.getStringExtra("refreshToken")?.let { if (it.isNotEmpty()) refreshToken = it }
        intent.getStringExtra("viagens")?.let { viagens = JSONArray(it) }
        persist()
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
          // Reinício pelo sistema (START_STICKY): recupera o estado salvo.
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
    if (callback != null) return
    isRunning = true

    acquireWakeLock()

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateIntervalMillis(intervalMs / 2)
      .setMinUpdateDistanceMeters(minDistanceM)
      .setWaitForAccurateLocation(false)
      .build()

    val cb = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        val loc = result.lastLocation ?: return
        // Envio imediato, dentro do serviço, em thread própria.
        io.execute { sendLocation(loc.latitude, loc.longitude, loc.accuracy, loc.speed, loc.bearing) }
      }
    }
    callback = cb

    try {
      fused.requestLocationUpdates(request, cb, Looper.getMainLooper())
      Log.i(TAG, "requestLocationUpdates ativo (interval=${intervalMs}ms)")
    } catch (e: SecurityException) {
      Log.e(TAG, "sem permissão de localização", e)
      stopTracking()
    }
  }

  private fun stopTracking() {
    callback?.let { fused.removeLocationUpdates(it) }
    callback = null
    isRunning = false
    releaseWakeLock()
    prefs(this).edit().clear().apply()
    stopForeground(true)
    stopSelf()
  }

  override fun onDestroy() {
    callback?.let { fused.removeLocationUpdates(it) }
    callback = null
    isRunning = false
    releaseWakeLock()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // -------------------------------------------------------------- supabase

  private fun sendLocation(lat: Double, lon: Double, acc: Float, speed: Float, bearing: Float) {
    if (supabaseUrl.isEmpty() || viagens.length() == 0) return

    val bateria = try {
      (getSystemService(Context.BATTERY_SERVICE) as BatteryManager)
        .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    } catch (_: Exception) {
      null
    }

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
        put("online", true)
      })
    }

    val pendentes = drainQueue()
    for (i in 0 until pendentes.length()) rows.put(pendentes.get(i))

    // Recusa definitiva (RLS: viagem já não está "em_andamento") não volta para a
    // fila — reenviar apenas repetiria a violação indefinidamente.
    if (!post(rows) && !lastRejectPermanent) enqueue(rows)
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
    // Limita a fila para não crescer sem controle (mantém as mais recentes).
    val max = 2000
    val trimmed = if (queue.length() > max) {
      JSONArray().also { out -> for (i in queue.length() - max until queue.length()) out.put(queue.get(i)) }
    } else queue
    prefs(this).edit().putString("queue", trimmed.toString()).apply()
  }

  private fun drainQueue(): JSONArray {
    val p = prefs(this)
    val queue = JSONArray(p.getString("queue", "[]"))
    if (queue.length() > 0) p.edit().putString("queue", "[]").apply()
    return queue
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

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIF_ID, notif)
    } else {
      startForeground(NOTIF_ID, notif)
    }
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
