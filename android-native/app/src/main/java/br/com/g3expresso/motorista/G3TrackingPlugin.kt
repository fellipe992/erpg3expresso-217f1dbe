package br.com.g3expresso.motorista

import android.Manifest
import android.content.Intent
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import org.json.JSONArray

/**
 * Ponte mínima entre o React e o serviço nativo.
 *
 * O JavaScript só faz três coisas:
 *   start()          -> liga o Foreground Service
 *   updateSession()  -> atualiza tokens/viagens quando o app está aberto
 *   stop()           -> desliga (FINALIZAR VIAGEM)
 *
 * Nenhuma posição passa pelo WebView.
 */
@CapacitorPlugin(
  name = "G3Tracking",
  permissions = [
    Permission(
      alias = "location",
      strings = [
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
      ],
    ),
    Permission(
      alias = "backgroundLocation",
      strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION],
    ),
    Permission(
      alias = "notifications",
      strings = [Manifest.permission.POST_NOTIFICATIONS],
    ),
  ],
)
class G3TrackingPlugin : Plugin() {

  @PluginMethod
  fun start(call: PluginCall) {
    val url = call.getString("supabaseUrl")
    val apiKey = call.getString("apiKey")
    val accessToken = call.getString("accessToken")
    val viagens: JSONArray = call.getArray("viagens") ?: JSONArray()

    if (url.isNullOrEmpty() || apiKey.isNullOrEmpty() || accessToken.isNullOrEmpty()) {
      call.reject("supabaseUrl, apiKey e accessToken são obrigatórios")
      return
    }
    if (viagens.length() == 0) {
      call.reject("nenhuma viagem em andamento")
      return
    }

    if (!hasLocationPermissions()) {
      requestPermissionForAliases(arrayOf("location", "backgroundLocation", "notifications"), call, "permsCallback")
      return
    }

    launchService(url, apiKey, accessToken, call.getString("refreshToken") ?: "", viagens,
      call.getLong("intervalMs", 20_000L) ?: 20_000L,
      call.getFloat("minDistanceM", 0f) ?: 0f)

    call.resolve(JSObject().put("running", true))
  }

  @com.getcapacitor.annotation.PermissionCallback
  private fun permsCallback(call: PluginCall) {
    if (!hasLocationPermissions()) {
      call.reject("Permissão de localização em segundo plano não concedida")
      return
    }
    start(call)
  }

  @PluginMethod
  fun updateSession(call: PluginCall) {
    val intent = Intent(context, G3TrackingService::class.java).apply {
      action = G3TrackingService.ACTION_UPDATE_SESSION
      putExtra("accessToken", call.getString("accessToken") ?: "")
      putExtra("refreshToken", call.getString("refreshToken") ?: "")
      call.getArray("viagens")?.let { putExtra("viagens", it.toString()) }
    }
    context.startService(intent)
    call.resolve()
  }

  @PluginMethod
  fun stop(call: PluginCall) {
    val intent = Intent(context, G3TrackingService::class.java).apply {
      action = G3TrackingService.ACTION_STOP
    }
    context.startService(intent)
    call.resolve(JSObject().put("running", false))
  }

  @PluginMethod
  fun isRunning(call: PluginCall) {
    call.resolve(JSObject().put("running", G3TrackingService.isRunning))
  }

  private fun hasLocationPermissions(): Boolean {
    val fine = getPermissionState("location") == com.getcapacitor.PermissionState.GRANTED
    val bg = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      getPermissionState("backgroundLocation") == com.getcapacitor.PermissionState.GRANTED
    } else true
    return fine && bg
  }

  private fun launchService(
    url: String,
    apiKey: String,
    accessToken: String,
    refreshToken: String,
    viagens: JSONArray,
    intervalMs: Long,
    minDistanceM: Float,
  ) {
    val intent = Intent(context, G3TrackingService::class.java).apply {
      action = G3TrackingService.ACTION_START
      putExtra("supabaseUrl", url.trimEnd('/'))
      putExtra("apiKey", apiKey)
      putExtra("accessToken", accessToken)
      putExtra("refreshToken", refreshToken)
      putExtra("viagens", viagens.toString())
      putExtra("intervalMs", intervalMs)
      putExtra("minDistanceM", minDistanceM)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent)
    } else {
      context.startService(intent)
    }
  }
}
