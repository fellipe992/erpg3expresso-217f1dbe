import type { CodigoRegiao, Coordenada, Entrega } from "./tipos";
import { centroide, haversine } from "./geo";

export const REGIOES: Record<CodigoRegiao, { rotulo: string; cor: string; corSuave: string }> = {
  centro: { rotulo: "Centro", cor: "#7C3AED", corSuave: "#7C3AED22" },
  norte: { rotulo: "Zona Norte", cor: "#2563EB", corSuave: "#2563EB22" },
  sul: { rotulo: "Zona Sul", cor: "#DC2626", corSuave: "#DC262622" },
  leste: { rotulo: "Zona Leste", cor: "#16A34A", corSuave: "#16A34A22" },
  oeste: { rotulo: "Zona Oeste", cor: "#F15A24", corSuave: "#F15A2422" },
};

export const CORES_ROTA = [
  "#F15A24",
  "#2563EB",
  "#16A34A",
  "#DC2626",
  "#7C3AED",
  "#0891B2",
  "#CA8A04",
  "#DB2777",
  "#0F766E",
  "#9333EA",
];

export function corDaRota(indice: number) {
  return CORES_ROTA[indice % CORES_ROTA.length];
}

function bearing(centro: Coordenada, p: Coordenada) {
  const dx = (p.lng - centro.lng) * Math.cos((centro.lat * Math.PI) / 180);
  const dy = p.lat - centro.lat;
  const ang = (Math.atan2(dx, dy) * 180) / Math.PI;
  return (ang + 360) % 360;
}

function classificar(centro: Coordenada, p: Coordenada, raioCentroKm: number): CodigoRegiao {
  if (haversine(centro, p) <= raioCentroKm) return "centro";
  const b = bearing(centro, p);
  if (b >= 315 || b < 45) return "norte";
  if (b < 135) return "leste";
  if (b < 225) return "sul";
  return "oeste";
}

/**
 * Identifica automaticamente a região geográfica de cada entrega a partir do
 * centro de massa da operação. Funciona em qualquer cidade: o raio do "Centro"
 * é proporcional à dispersão dos pontos.
 */
export function identificarRegioes<T extends Entrega>(entregas: T[]): T[] {
  const pontos = entregas.filter(
    (e): e is T & Coordenada => typeof e.lat === "number" && typeof e.lng === "number",
  );
  if (!pontos.length) return entregas;
  const centro = centroide(pontos);
  const distancias = pontos.map((p) => haversine(centro, p)).sort((a, b) => a - b);
  const mediana = distancias[Math.floor(distancias.length / 2)] ?? 0;
  const raioCentroKm = Math.max(1.5, mediana * 0.45);

  return entregas.map((e) => {
    if (typeof e.lat !== "number" || typeof e.lng !== "number") return e;
    const codigo = classificar(centro, { lat: e.lat, lng: e.lng }, raioCentroKm);
    return { ...e, regiaoCodigo: codigo, regiao: REGIOES[codigo].rotulo };
  });
}

export type ResumoRegiao = {
  codigo: CodigoRegiao;
  rotulo: string;
  cor: string;
  entregas: number;
  pesoKg: number;
};

export function resumirRegioes(entregas: Entrega[]): ResumoRegiao[] {
  const mapa = new Map<CodigoRegiao, ResumoRegiao>();
  for (const e of entregas) {
    const codigo = e.regiaoCodigo;
    if (!codigo) continue;
    const atual =
      mapa.get(codigo) ??
      { codigo, rotulo: REGIOES[codigo].rotulo, cor: REGIOES[codigo].cor, entregas: 0, pesoKg: 0 };
    atual.entregas += 1;
    atual.pesoKg += e.pesoKg;
    mapa.set(codigo, atual);
  }
  return [...mapa.values()].sort((a, b) => b.entregas - a.entregas);
}

export function corDaEntrega(e: Entrega) {
  return e.regiaoCodigo ? REGIOES[e.regiaoCodigo].cor : "#7C7C7C";
}
