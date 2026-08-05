package br.com.g3expresso.motorista

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Registra o plugin nativo de rastreamento ANTES do bridge subir.
    registerPlugin(G3TrackingPlugin::class.java)
    super.onCreate(savedInstanceState)
  }
}
