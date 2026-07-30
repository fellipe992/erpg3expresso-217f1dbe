import { distanciaKm } from "./geo";
import { custoPorKm, ORDEM_CATEGORIAS } from "./frota";
import { avaliarJornada, pausasObrigatoriasMin } from "./jornada";
import {
  agruparPorSetor,
  escolherVeiculo,
  kmDaSequencia,
  refinar2opt,
  sequenciarVizinhoProximo,
  somenteGeocodificadas,
  type Cluster,
} from "./otimizador";
import type {
  Cenario,
  CustoDetalhado,
  Deposito,
  Entrega,
  ParadaRota,
  PerfilVeiculo,
  RegrasJornada,
  ResultadoSimulacao,
  Rota,
  TipoCenario,
} from "./tipos";

export type EntradaSimulacao = {
  entregas: Entrega[];
  deposito: Deposito;
  frota: PerfilVeiculo[];
  jornada: RegrasJornada;
  /** receita total prevista quando as entregas não trazem receita individual */
  receitaTotal?: number;
};

type Estrategia = {
  id: TipoCenario;
  nome: string;
  objetivo: string;
  /** fração da capacidade usada como alvo na formação dos clusters */
  ocupacaoAlvo: number;
  /** ordem de preferência dos veículos */
  preferencia: "menor" | "maior" | "melhor_ajuste";
  /** intensidade do refino geográfico */
  passadas2opt: number;
  /** pesos do score multicritério */
  pesos: { custo: number; tempo: number; km: number; ocupacao: number };
};

export const ESTRATEGIAS: Estrategia[] = [
  {
    id: "custo",
    nome: "Menor custo",
    objetivo: "Usar o mínimo de veículos, priorizando os menores e mais baratos.",
    ocupacaoAlvo: 0.98,
    preferencia: "menor",
    passadas2opt: 3,
    pesos: { custo: 0.7, tempo: 0.1, km: 0.1, ocupacao: 0.1 },
  },
  {
    id: "tempo",
    nome: "Menor tempo",
    objetivo: "Concluir todas as entregas no menor tempo, paralelizando veículos.",
    ocupacaoAlvo: 0.45,
    preferencia: "melhor_ajuste",
    passadas2opt: 4,
    pesos: { custo: 0.1, tempo: 0.7, km: 0.1, ocupacao: 0.1 },
  },
  {
    id: "ocupacao",
    nome: "Melhor ocupação",
    objetivo: "Maximizar o aproveitamento da capacidade de cada veículo.",
    ocupacaoAlvo: 1,
    preferencia: "melhor_ajuste",
    passadas2opt: 3,
    pesos: { custo: 0.15, tempo: 0.1, km: 0.15, ocupacao: 0.6 },
  },
  {
    id: "km",
    nome: "Menor quilometragem",
    objetivo: "Reduzir ao máximo a distância percorrida pela frota.",
    ocupacaoAlvo: 0.85,
    preferencia: "menor",
    passadas2opt: 8,
    pesos: { custo: 0.15, tempo: 0.1, km: 0.65, ocupacao: 0.1 },
  },
  {
    id: "balanceado",
    nome: "Balanceado",
    objetivo: "Equilibrar custo, quilometragem, tempo e ocupação da frota.",
    ocupacaoAlvo: 0.9,
    preferencia: "melhor_ajuste",
    passadas2opt: 5,
    pesos: { custo: 0.3, tempo: 0.25, km: 0.2, ocupacao: 0.25 },
  },
];

const custoZero = (): CustoDetalhado => ({
  combustivel: 0,
  pedagio: 0,
  motorista: 0,
  hora: 0,
  manutencao: 0,
  depreciacao: 0,
  seguro: 0,
  pneus: 0,
  outros: 0,
  total: 0,
});

export function somarCustos(lista: CustoDetalhado[]): CustoDetalhado {
  return lista.reduce((acc, c) => {
    (Object.keys(acc) as (keyof CustoDetalhado)[]).forEach((k) => {
      acc[k] += c[k];
    });
    return acc;
  }, custoZero());
}

export function calcularCusto(v: PerfilVeiculo, km: number, minutos: number): CustoDetalhado {
  const c = v.custos;
  const horas = minutos / 60;
  const detalhe: CustoDetalhado = {
    combustivel: (km / Math.max(0.5, c.consumoKmL)) * c.precoCombustivel,
    pedagio: km * c.pedagioPorKm,
    motorista: c.salarioDiario,
    hora: horas * c.custoHora,
    manutencao: km * c.manutencaoKm,
    depreciacao: km * c.depreciacaoKm,
    seguro: c.seguroDia,
    pneus: km * c.pneusKm,
    outros: km * c.outrosKm,
    total: 0,
  };
  detalhe.total =
    detalhe.combustivel +
    detalhe.pedagio +
    detalhe.motorista +
    detalhe.hora +
    detalhe.manutencao +
    detalhe.depreciacao +
    detalhe.seguro +
    detalhe.pneus +
    detalhe.outros;
  return detalhe;
}

function ordenarFrota(frota: PerfilVeiculo[], preferencia: Estrategia["preferencia"]) {
  const porOrdem = (v: PerfilVeiculo) => ORDEM_CATEGORIAS.indexOf(v.categoria);
  if (preferencia === "maior") return [...frota].sort((a, b) => porOrdem(b) - porOrdem(a));
  if (preferencia === "melhor_ajuste")
    return [...frota].sort((a, b) => custoPorKm(a) / a.capacidadeKg - custoPorKm(b) / b.capacidadeKg);
  return [...frota].sort((a, b) => porOrdem(a) - porOrdem(b));
}

export function montarRota(
  id: string,
  veiculo: PerfilVeiculo,
  cluster: Cluster,
  deposito: Deposito,
  jornada: RegrasJornada,
  passadas2opt: number,
): Rota {
  const seq = refinar2opt(
    sequenciarVizinhoProximo(cluster.entregas, deposito),
    deposito,
    passadas2opt,
  );

  const paradas: ParadaRota[] = [];
  let km = 0;
  let relogio = 0;
  let anterior = { lat: deposito.lat, lng: deposito.lng };
  seq.forEach((e, i) => {
    const trecho = distanciaKm(anterior, e);
    km += trecho;
    relogio += (trecho / veiculo.velocidadeMediaKmh) * 60;
    const chegada = relogio;
    relogio += e.tempoDescargaMin;
    paradas.push({
      entrega: e,
      ordem: i + 1,
      kmAcumulado: km,
      chegadaMin: chegada,
      saidaMin: relogio,
      atrasada: typeof e.janelaFimMin === "number" && chegada > e.janelaFimMin,
    });
    anterior = { lat: e.lat, lng: e.lng };
  });
  const retorno = distanciaKm(anterior, deposito);
  km += retorno;
  const minutosDirecao = (km / veiculo.velocidadeMediaKmh) * 60;
  const minutosParado = seq.reduce((s, e) => s + e.tempoDescargaMin, 0);
  const pausas = pausasObrigatoriasMin(minutosDirecao, jornada);
  const minutos = minutosDirecao + minutosParado + pausas;

  const rota: Rota = {
    id,
    veiculo,
    paradas,
    km,
    minutos,
    minutosDirecao,
    minutosParado: minutosParado + pausas,
    pesoKg: cluster.pesoKg,
    volumeM3: cluster.volumeM3,
    ocupacaoPeso: veiculo.capacidadeKg ? cluster.pesoKg / veiculo.capacidadeKg : 0,
    custo: calcularCusto(veiculo, km, minutos),
    receita: cluster.entregas.reduce((s, e) => s + (e.receita ?? 0), 0),
    alertasJornada: [],
  };
  rota.alertasJornada = avaliarJornada(rota, jornada);
  return rota;
}

function gerarCenario(entrada: EntradaSimulacao, estrategia: Estrategia): Cenario {
  const { deposito, jornada } = entrada;
  const entregas = somenteGeocodificadas(entrada.entregas);
  const frota = ordenarFrota(
    entrada.frota.filter((v) => v.disponiveis > 0),
    estrategia.preferencia,
  );

  const rotas: Rota[] = [];
  const naoAtendidas: Entrega[] = [];
  const usados: Record<string, number> = {};

  const maiorKg = Math.max(...frota.map((v) => v.capacidadeKg), 0);
  const maiorM3 = Math.max(...frota.map((v) => v.capacidadeM3), 0);
  const alvoKg = Math.max(1, maiorKg * estrategia.ocupacaoAlvo);
  const alvoM3 = Math.max(0, maiorM3 * estrategia.ocupacaoAlvo);

  let clusters = agruparPorSetor(entregas, deposito, alvoKg, alvoM3);

  // No cenário de menor custo/km, tenta compactar clusters no menor veículo possível.
  if (estrategia.preferencia === "menor") {
    clusters = clusters.flatMap((c) => {
      const cabe = frota.some((v) => v.capacidadeKg >= c.pesoKg && v.capacidadeM3 >= c.volumeM3);
      if (cabe) return [c];
      const menorAlvo = Math.max(...frota.map((v) => v.capacidadeKg));
      return agruparPorSetor(c.entregas, deposito, menorAlvo, maiorM3);
    });
  }

  clusters.forEach((cluster, i) => {
    let veiculo = escolherVeiculo(cluster, frota, usados);
    if (!veiculo) {
      // sem veículo disponível para o cluster inteiro: tenta o maior livre e sobra o resto
      const livre = frota
        .filter((v) => (usados[v.id] ?? 0) < v.disponiveis)
        .sort((a, b) => b.capacidadeKg - a.capacidadeKg)[0];
      if (!livre) {
        naoAtendidas.push(...cluster.entregas);
        return;
      }
      const cabem: Cluster = { entregas: [], pesoKg: 0, volumeM3: 0 };
      for (const e of cluster.entregas) {
        if (cabem.pesoKg + e.pesoKg <= livre.capacidadeKg) {
          cabem.entregas.push(e);
          cabem.pesoKg += e.pesoKg;
          cabem.volumeM3 += e.volumeM3 ?? 0;
        } else naoAtendidas.push(e);
      }
      if (!cabem.entregas.length) return;
      cluster = cabem;
      veiculo = livre;
    }
    usados[veiculo.id] = (usados[veiculo.id] ?? 0) + 1;
    rotas.push(
      montarRota(
        `${estrategia.id}-${i + 1}`,
        veiculo,
        cluster,
        deposito,
        jornada,
        estrategia.passadas2opt,
      ),
    );
  });

  const km = rotas.reduce((s, r) => s + r.km, 0);
  const minutos = rotas.reduce((s, r) => s + r.minutos, 0);
  const custoDetalhado = somarCustos(rotas.map((r) => r.custo));
  const pesoKg = rotas.reduce((s, r) => s + r.pesoKg, 0);
  const receitaEntregas = rotas.reduce((s, r) => s + r.receita, 0);
  const receita = receitaEntregas > 0 ? receitaEntregas : (entrada.receitaTotal ?? 0);
  const ocupacaoMedia = rotas.length
    ? rotas.reduce((s, r) => s + r.ocupacaoPeso, 0) / rotas.length
    : 0;

  return {
    id: estrategia.id,
    nome: estrategia.nome,
    objetivo: estrategia.objetivo,
    rotas,
    veiculos: rotas.length,
    km,
    minutos,
    minutosOperacao: rotas.length ? Math.max(...rotas.map((r) => r.minutos)) : 0,
    pesoKg,
    custo: custoDetalhado.total,
    custoDetalhado,
    receita,
    ocupacaoMedia,
    entregasAtendidas: rotas.reduce((s, r) => s + r.paradas.length, 0),
    entregasNaoAtendidas: naoAtendidas,
    score: 0,
    recomendado: false,
  };
}

/** Normaliza e pontua os cenários (0-100) para eleger o recomendado. */
function pontuar(cenarios: Cenario[]) {
  const validos = cenarios.filter((c) => c.rotas.length);
  if (!validos.length) return;
  const min = (f: (c: Cenario) => number) => Math.min(...validos.map(f));
  const max = (f: (c: Cenario) => number) => Math.max(...validos.map(f));
  const norm = (v: number, lo: number, hi: number, inverso: boolean) => {
    if (hi - lo < 1e-6) return 1;
    const x = (v - lo) / (hi - lo);
    return inverso ? 1 - x : x;
  };
  const faixas = {
    custo: [min((c) => c.custo), max((c) => c.custo)],
    tempo: [min((c) => c.minutosOperacao), max((c) => c.minutosOperacao)],
    km: [min((c) => c.km), max((c) => c.km)],
    ocupacao: [min((c) => c.ocupacaoMedia), max((c) => c.ocupacaoMedia)],
  };
  const pesos = ESTRATEGIAS.find((e) => e.id === "balanceado")!.pesos;
  cenarios.forEach((c) => {
    if (!c.rotas.length) {
      c.score = 0;
      return;
    }
    const s =
      pesos.custo * norm(c.custo, faixas.custo[0], faixas.custo[1], true) +
      pesos.tempo * norm(c.minutosOperacao, faixas.tempo[0], faixas.tempo[1], true) +
      pesos.km * norm(c.km, faixas.km[0], faixas.km[1], true) +
      pesos.ocupacao * norm(c.ocupacaoMedia, faixas.ocupacao[0], faixas.ocupacao[1], false);
    const penalidade = c.entregasNaoAtendidas.length ? 0.5 : 1;
    c.score = Math.round(s * 100 * penalidade);
  });
}

export function simularCenarios(entrada: EntradaSimulacao): ResultadoSimulacao {
  const cenarios = ESTRATEGIAS.map((e) => gerarCenario(entrada, e));
  pontuar(cenarios);
  const melhor = [...cenarios].sort((a, b) => b.score - a.score)[0];
  cenarios.forEach((c) => {
    c.recomendado = c.id === melhor?.id;
  });
  return { cenarios, recomendado: melhor?.id ?? "balanceado" };
}
