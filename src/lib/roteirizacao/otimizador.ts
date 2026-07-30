import { anguloPolar, centroide, distanciaKm, temCoordenada } from "./geo";
import type { Coordenada, Deposito, Entrega, PerfilVeiculo } from "./tipos";

export type Cluster = { entregas: (Entrega & Coordenada)[]; pesoKg: number; volumeM3: number };

/**
 * Sweep algorithm: ordena as entregas pelo ângulo polar em relação ao depósito
 * e agrupa respeitando a capacidade alvo. É O(n log n) — escala para milhares
 * de pedidos — e gera clusters geograficamente coerentes.
 */
export function agruparPorSetor(
  entregas: (Entrega & Coordenada)[],
  deposito: Deposito,
  capacidadeKgAlvo: number,
  capacidadeM3Alvo: number,
  maxEntregas?: number,
): Cluster[] {
  if (!entregas.length) return [];
  const ordenadas = [...entregas].sort(
    (a, b) => anguloPolar(deposito, a) - anguloPolar(deposito, b),
  );
  const clusters: Cluster[] = [];
  let atual: Cluster = { entregas: [], pesoKg: 0, volumeM3: 0 };
  for (const e of ordenadas) {
    const vol = e.volumeM3 ?? 0;
    const estouraPeso = atual.entregas.length > 0 && atual.pesoKg + e.pesoKg > capacidadeKgAlvo;
    const estouraVol =
      capacidadeM3Alvo > 0 && atual.entregas.length > 0 && atual.volumeM3 + vol > capacidadeM3Alvo;
    const estouraQtd = !!maxEntregas && atual.entregas.length >= maxEntregas;
    if (estouraPeso || estouraVol || estouraQtd) {
      clusters.push(atual);
      atual = { entregas: [], pesoKg: 0, volumeM3: 0 };
    }
    atual.entregas.push(e);
    atual.pesoKg += e.pesoKg;
    atual.volumeM3 += vol;
  }
  if (atual.entregas.length) clusters.push(atual);
  return clusters;
}

/** Vizinho mais próximo a partir do depósito. */
export function sequenciarVizinhoProximo(
  entregas: (Entrega & Coordenada)[],
  deposito: Deposito,
): (Entrega & Coordenada)[] {
  const restantes = [...entregas];
  const seq: (Entrega & Coordenada)[] = [];
  let atual: Coordenada = deposito;
  while (restantes.length) {
    let melhor = 0;
    let melhorD = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const d = distanciaKm(atual, restantes[i]);
      if (d < melhorD) {
        melhorD = d;
        melhor = i;
      }
    }
    const [e] = restantes.splice(melhor, 1);
    seq.push(e);
    atual = e;
  }
  return seq;
}

/** Refino 2-opt (com limite de iterações para manter a resposta interativa). */
export function refinar2opt(
  seq: (Entrega & Coordenada)[],
  deposito: Deposito,
  maxPassadas = 4,
): (Entrega & Coordenada)[] {
  if (seq.length < 4) return seq;
  const rota = [...seq];
  const pontos = () => [deposito, ...rota, deposito];
  const d = (a: Coordenada, b: Coordenada) => distanciaKm(a, b);
  for (let passada = 0; passada < maxPassadas; passada++) {
    let melhorou = false;
    const p = pontos();
    for (let i = 1; i < p.length - 2; i++) {
      for (let j = i + 1; j < p.length - 1; j++) {
        const delta =
          d(p[i - 1], p[j]) + d(p[i], p[j + 1]) - d(p[i - 1], p[i]) - d(p[j], p[j + 1]);
        if (delta < -0.001) {
          const trecho = rota.slice(i - 1, j).reverse();
          rota.splice(i - 1, j - i + 1, ...trecho);
          melhorou = true;
          p.splice(0, p.length, deposito, ...rota, deposito);
        }
      }
    }
    if (!melhorou) break;
  }
  return rota;
}

export function kmDaSequencia(seq: Coordenada[], deposito: Deposito, retornarBase = true) {
  if (!seq.length) return 0;
  let km = distanciaKm(deposito, seq[0]);
  for (let i = 0; i < seq.length - 1; i++) km += distanciaKm(seq[i], seq[i + 1]);
  if (retornarBase) km += distanciaKm(seq[seq.length - 1], deposito);
  return km;
}

/** Menor veículo capaz de atender o cluster, dentro dos perfis disponíveis. */
export function escolherVeiculo(
  cluster: Cluster,
  perfis: PerfilVeiculo[],
  usados: Record<string, number>,
): PerfilVeiculo | null {
  const candidatos = perfis
    .filter((p) => (usados[p.id] ?? 0) < p.disponiveis)
    .filter((p) => p.capacidadeKg >= cluster.pesoKg && p.capacidadeM3 >= cluster.volumeM3)
    .filter((p) => !p.maxEntregas || cluster.entregas.length <= p.maxEntregas)
    .sort((a, b) => a.capacidadeKg - b.capacidadeKg);
  return candidatos[0] ?? null;
}

export function centroCluster(c: Cluster) {
  return centroide(c.entregas);
}

export function somenteGeocodificadas(entregas: Entrega[]) {
  return entregas.filter(temCoordenada);
}

/**
 * Sequenciamento sensível a janelas de entrega: em cada passo escolhe o
 * próximo ponto equilibrando distância, risco de atraso e urgência da janela.
 */
export function sequenciarComJanelas(
  entregas: (Entrega & Coordenada)[],
  deposito: Deposito,
  velocidadeKmh: number,
): (Entrega & Coordenada)[] {
  const restantes = [...entregas];
  const seq: (Entrega & Coordenada)[] = [];
  let atual: Coordenada = deposito;
  let relogio = 0;
  const v = Math.max(5, velocidadeKmh);
  while (restantes.length) {
    let melhor = 0;
    let melhorScore = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const e = restantes[i];
      const d = distanciaKm(atual, e);
      const chegada = relogio + (d / v) * 60;
      const janela = e.janelaFimMin;
      const atraso = janela != null ? Math.max(0, chegada - janela) : 0;
      const folga = janela != null ? Math.max(0, janela - chegada) : 720;
      const score = d + atraso * 2.5 + folga * 0.04;
      if (score < melhorScore) {
        melhorScore = score;
        melhor = i;
      }
    }
    const [e] = restantes.splice(melhor, 1);
    const d = distanciaKm(atual, e);
    relogio += (d / v) * 60 + e.tempoDescargaMin;
    seq.push(e);
    atual = e;
  }
  return seq;
}

export function temJanelas(entregas: Entrega[]) {
  return entregas.some((e) => typeof e.janelaFimMin === "number");
}
