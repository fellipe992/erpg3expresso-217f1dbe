package br.com.g3expresso.motorista

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Religa o rastreamento sozinho, sem o motorista abrir o app:
 *
 * - BOOT_COMPLETED / QUICKBOOT: celular reiniciou (bateria acabou e carregou).
 * - MY_PACKAGE_REPLACED: app atualizado.
 * - ACTION_REVIVE: alarme periódico do próprio serviço (auto-recuperação caso o
 *   sistema tenha matado o processo).
 *
 * Só sobe o serviço se houver viagem em andamento salva; ao finalizar a viagem
 * o estado é limpo e nada é religado.
 */
class G3BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    Log.i("G3Tracking", "receiver: $action")
    when (action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.intent.action.QUICKBOOT_POWERON",
      G3TrackingService.ACTION_REVIVE,
      -> G3TrackingService.startIfActive(context)
    }
  }
}
