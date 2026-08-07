/// <reference types="google.maps" />
import { loadGoogleMaps } from "@/lib/google-maps-loader";

/**
 * Otimiza a sequência de pontos intermediários usando o Directions Service
 * do Google (`optimizeWaypoints`), o mesmo recurso usado pelo roteirizador.
 * Retorna a nova ordem (índices do array original) e o resumo da rota.
 */
export async function otimizarParadas(params: {
  origem: string;
  destino: string;
  paradas: string[];
}): Promise<{ ordem: number[]; km: number; minutos: number }> {
  const { origem, destino, paradas } = params;
  const validas = paradas.map((p) => p.trim());
  if (!origem.trim() || !destino.trim()) throw new Error("Informe origem e destino para otimizar.");
  if (validas.filter(Boolean).length < 2) throw new Error("Adicione pelo menos 2 paradas para otimizar.");
  if (validas.some((p) => !p)) throw new Error("Preencha todas as paradas antes de otimizar.");

  await loadGoogleMaps();
  const { DirectionsService } = (await google.maps.importLibrary(
    "routes",
  )) as google.maps.RoutesLibrary;
  const service = new DirectionsService();

  const resposta = await service.route({
    origin: origem,
    destination: destino,
    waypoints: validas.map((p) => ({ location: p, stopover: true })),
    optimizeWaypoints: true,
    travelMode: google.maps.TravelMode.DRIVING,
    region: "br",
  });

  const rota = resposta.routes[0];
  if (!rota) throw new Error("Não foi possível calcular a rota otimizada.");

  const ordem = rota.waypoint_order ?? validas.map((_, i) => i);
  const km = (rota.legs ?? []).reduce((s, l) => s + (l.distance?.value ?? 0), 0) / 1000;
  const minutos = (rota.legs ?? []).reduce((s, l) => s + (l.duration?.value ?? 0), 0) / 60;
  return { ordem, km, minutos };
}

/** Reordena um array conforme a ordem devolvida pela otimização. */
export function aplicarOrdem<T>(itens: T[], ordem: number[]): T[] {
  const usados = new Set<number>();
  const saida: T[] = [];
  for (const i of ordem) {
    if (itens[i] !== undefined && !usados.has(i)) {
      saida.push(itens[i]);
      usados.add(i);
    }
  }
  itens.forEach((item, i) => {
    if (!usados.has(i)) saida.push(item);
  });
  return saida;
}
