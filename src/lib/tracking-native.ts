import { registerPlugin } from "@capacitor/core";

export type ViagemTracking = {
  id: string;
  motorista_id: string | null;
  veiculo_id: string | null;
};

export type G3TrackingStartOptions = {
  supabaseUrl: string;
  apiKey: string;
  accessToken: string;
  refreshToken?: string;
  viagens: ViagemTracking[];
  /** Intervalo entre posições (padrão 20s). */
  intervalMs?: number;
  /** Distância mínima em metros para gerar nova posição (0 = sempre). */
  minDistanceM?: number;
};

export interface G3TrackingPlugin {
  start(options: G3TrackingStartOptions): Promise<{ running: boolean }>;
  updateSession(options: {
    accessToken: string;
    refreshToken?: string;
    viagens?: ViagemTracking[];
  }): Promise<void>;
  stop(): Promise<{ running: boolean }>;
  isRunning(): Promise<{ running: boolean }>;
}

/**
 * Plugin nativo (Kotlin) que roda o Foreground Service com
 * FusedLocationProviderClient e envia cada posição direto ao banco.
 * O JavaScript apenas liga/desliga — nenhuma posição passa pelo WebView.
 *
 * Código nativo em `android-native/` (ver README de lá).
 */
export const G3Tracking = registerPlugin<G3TrackingPlugin>("G3Tracking");
