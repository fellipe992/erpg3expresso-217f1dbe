import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config — ajuste temporário para testes.
 * Apontando exclusivamente ao domínio padrão do Lovable
 * (https://erpg3expresso.lovable.app) para isolar problemas de
 * autenticação da Google Maps JavaScript API no domínio personalizado.
 */
const config: CapacitorConfig = {
  appId: "br.com.g3expresso.motorista",
  appName: "G3 Motorista",
  webDir: "dist",
  server: {
    url: "https://erpg3expresso.lovable.app",
    cleartext: false,
    androidScheme: "https",
    allowNavigation: [
      "erpg3expresso.lovable.app",
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
