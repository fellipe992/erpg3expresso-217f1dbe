package br.com.g3expresso.motorista

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Libera a permissão do microfone no Android ANTES do WebView tentar usar.
 *
 * O navegador interno só entrega o microfone quando o Android já concedeu a
 * permissão; sem isso o botão "Falar contexto" falha silenciosamente.
 *
 *   ensureMicrophone()     -> mostra a janela do Android e devolve { granted }
 *   isMicrophoneGranted()  -> só consulta, sem janela
 *   openSettings()         -> abre Ajustes > Apps > G3 Motorista (uso quando
 *                             o usuário marcou "não perguntar de novo")
 */
@CapacitorPlugin(
  name = "G3Permissions",
  permissions = [
    Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO]),
  ],
)
class G3PermissionsPlugin : Plugin() {

  @PluginMethod
  fun ensureMicrophone(call: PluginCall) {
    if (getPermissionState("microphone") == PermissionState.GRANTED) {
      call.resolve(resultado(true))
      return
    }
    requestPermissionForAlias("microphone", call, "micCallback")
  }

  @PermissionCallback
  private fun micCallback(call: PluginCall) {
    call.resolve(resultado(getPermissionState("microphone") == PermissionState.GRANTED))
  }

  @PluginMethod
  fun isMicrophoneGranted(call: PluginCall) {
    call.resolve(resultado(getPermissionState("microphone") == PermissionState.GRANTED))
  }

  @PluginMethod
  fun openSettings(call: PluginCall) {
    try {
      val intent = Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.fromParts("package", context.packageName, null),
      ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      context.startActivity(intent)
      call.resolve()
    } catch (e: Exception) {
      call.reject("não foi possível abrir os ajustes do app")
    }
  }

  private fun resultado(granted: Boolean): JSObject = JSObject().put("granted", granted)
}
