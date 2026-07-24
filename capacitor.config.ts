import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config para o app Android do motorista da G3 Expresso.
 *
 * Estratégia: hybrid webview.
 * O app instalado nos celulares carrega diretamente o site publicado
 * (https://erp.g3expresso.com.br). Assim, qualquer atualização feita no
 * Lovable/ERP aparece automaticamente no aplicativo — não é preciso
 * republicar a APK a cada mudança de tela.
 *
 * Os plugins nativos (Camera, Geolocation, BackgroundGeolocation, etc.)
 * continuam funcionando normalmente pela ponte JS ↔ nativa.
 */
const config: CapacitorConfig = {
  appId: "br.com.g3expresso.motorista",
  appName: "G3 Motorista",
  webDir: "dist",
  server: {
    url: "https://erp.g3expresso.com.br",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: [
      "erp.g3expresso.com.br",
      "*.lovable.app",
      "*.lovableproject.com",
      "*.supabase.co",
      "maps.googleapis.com",
      "maps.gstatic.com",
    ],
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#141414",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#141414",
    },
    Keyboard: {
      resize: "body",
    },
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#F15A24",
    },
    Geolocation: {
      // Permissões declaradas no AndroidManifest.xml gerado pelo `cap add android`
    },
  },
};

export default config;
