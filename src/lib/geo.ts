/**
 * Captura e gravação pontual de posição — usada pelo app do motorista tanto
 * para atender pedidos da operação quanto para retomar o envio depois de um
 * período sem localização.
 */
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/native";

export type ViagemAlvo = {
  id: string;
  motorista_id: string | null;
  veiculo_id: string | null;
};

/** Lê o GPS do aparelho (nativo ou navegador). */
export async function capturarPosicao(): Promise<GeolocationCoordinates | null> {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 25_000,
      });
      return pos.coords as unknown as GeolocationCoordinates;
    } catch {
      return null;
    }
  }
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 25_000 },
    );
  });
}

/** Grava a posição informada em todas as viagens recebidas. */
export async function gravarPosicao(viagens: ViagemAlvo[], coords: GeolocationCoordinates) {
  if (viagens.length === 0) return;
  await supabase.from("viagem_localizacoes").insert(
    viagens.map((v) => ({
      viagem_id: v.id,
      motorista_id: v.motorista_id,
      veiculo_id: v.veiculo_id,
      latitude: coords.latitude,
      longitude: coords.longitude,
      precisao: coords.accuracy ?? null,
      velocidade: coords.speed ?? null,
      heading: coords.heading ?? null,
      online: typeof navigator !== "undefined" ? navigator.onLine : true,
    })),
  );
}

/** Captura e grava numa única chamada. Retorna true quando conseguiu enviar. */
export async function capturarEGravar(viagens: ViagemAlvo[]): Promise<boolean> {
  if (viagens.length === 0) return false;
  const coords = await capturarPosicao();
  if (!coords) return false;
  try {
    await gravarPosicao(viagens, coords);
    return true;
  } catch {
    return false;
  }
}
