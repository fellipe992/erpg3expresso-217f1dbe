package br.com.g3expresso.motorista

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Registra os plugins nativos ANTES do bridge subir.
    registerPlugin(G3TrackingPlugin::class.java)
    registerPlugin(G3PermissionsPlugin::class.java)
    super.onCreate(savedInstanceState)
  }
}
