import type { Coordenada, Entrega } from "./tipos";

const R = 6371;
/** Fator de sinuosidade: converte distância em linha reta em distância rodoviária aproximada. */
export const FATOR_RODOVIARIO = 1.32;

export function haversine(a: Coordenada, b: Coordenada) {
  const rad = (v: number) => (v * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Distância rodoviária estimada em km. Substituível por Routes/Distance Matrix API. */
export function distanciaKm(a: Coordenada, b: Coordenada) {
  return haversine(a, b) * FATOR_RODOVIARIO;
}

/**
 * Matriz de distâncias em km. Complexidade O(n²) mas em memória tipada,
 * suportando milhares de pontos sem custo de API.
 */
export function matrizDistancias(pontos: Coordenada[]) {
  const n = pontos.length;
  const m = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distanciaKm(pontos[i], pontos[j]);
      m[i * n + j] = d;
      m[j * n + i] = d;
    }
  }
  return { n, get: (i: number, j: number) => m[i * n + j] };
}

export function anguloPolar(centro: Coordenada, p: Coordenada) {
  return Math.atan2(p.lat - centro.lat, p.lng - centro.lng);
}

export function temCoordenada(e: Entrega): e is Entrega & Coordenada {
  return typeof e.lat === "number" && typeof e.lng === "number";
}

export function centroide(pontos: Coordenada[]): Coordenada {
  if (!pontos.length) return { lat: 0, lng: 0 };
  return {
    lat: pontos.reduce((s, p) => s + p.lat, 0) / pontos.length,
    lng: pontos.reduce((s, p) => s + p.lng, 0) / pontos.length,
  };
}
