import { centroide, distanciaKm, temCoordenada } from "./geo";
import { identificarRegioes } from "./regioes";
import { custoPorKm, OPCOES_OTIMIZACAO_PADRAO, ORDEM_CATEGORIAS } from "./frota";
import { avaliarJornada, pausasObrigatoriasMin } from "./jornada";
import {
  agruparPorSetor,
  melhorInsercao,
  montarSequenciaPorPeso,
  refinar2opt,
  sequenciarComJanelas,
  sequenciarVizinhoProximo,
  somenteGeocodificadas,
  temJanelas,
  type Cluster,
} from "./otimizador";
import type {
  Cenario,
  Coordenada,
  CustoDetalhado,
  Deposito,
  Entrega,
  OpcoesOtimizacao,
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
  /** configuração do motor de otimização (modo, cubagem, consolidação) */
  opcoes?: Partial<OpcoesOtimizacao>;
};

/**
 * Pós-otimização: dissolve rotas com baixa ocupação de peso, realocando suas
 * entregas nas rotas próximas que ainda têm capacidade — reduz o número de
 * veículos sem aumentar significativamente a quilometragem.
 */
export function consolidarRotasOciosas(
  rotas: Rota[],
  deposito: Deposito,
  jornada: RegrasJornada,
  opcoes: OpcoesOtimizacao,
): Rota[] {
  if (rotas.length < 2) return rotas;
  const raioConfigurado = opcoes.raioProximidadeKm && opcoes.raioProximidadeKm > 0
    ? opcoes.raioProximidadeKm
    : null;
  let atuais = [...rotas];
  let mexeu = true;
  let voltas = 0;

  while (mexeu && voltas < 4) {
    mexeu = false;
    voltas += 1;
    const candidatas = atuais
      .filter((r) => r.ocupacaoPeso < opcoes.ocupacaoMinima)
      .sort((a, b) => a.ocupacaoPeso - b.ocupacaoPeso);

    for (const ociosa of candidatas) {
      const outras = atuais.filter((r) => r.id !== ociosa.id);
      if (!outras.length) continue;
      const entregas = ociosa.paradas.map((p) => p.entrega).filter(temCoordenada);

      // simula a realocação completa antes de aplicar
      const destinos = new Map<string, (Entrega & Coordenada)[]>();
      outras.forEach((r) => destinos.set(r.id, r.paradas.map((p) => p.entrega).filter(temCoordenada)));
      const pesos = new Map(outras.map((r) => [r.id, r.pesoKg]));
      const volumes = new Map(outras.map((r) => [r.id, r.volumeM3]));
      let coube = true;

      for (const bruta of entregas) {
        const e = { ...bruta, origemAlocacao: "consolidacao" as const };
        let alvoId = "";
        let alvoPos = 0;
        let melhorDelta = Infinity;
        for (const r of outras) {
          const seq = destinos.get(r.id)!;
          if ((pesos.get(r.id) ?? 0) + e.pesoKg > r.veiculo.capacidadeKg) continue;
          if (
            !opcoes.ignorarCubagem &&
            (volumes.get(r.id) ?? 0) + (e.volumeM3 ?? 0) > r.veiculo.capacidadeM3
          )
            continue;
          if (r.veiculo.maxEntregas && seq.length >= r.veiculo.maxEntregas) continue;
          const { posicao, delta } = melhorInsercao(seq, e, r.deposito ?? deposito);
          if (delta < melhorDelta) {
            melhorDelta = delta;
            alvoId = r.id;
            alvoPos = posicao;
          }
        }
        if (!alvoId) {
          coube = false;
          break;
        }
        destinos.get(alvoId)!.splice(alvoPos, 0, e);
        pesos.set(alvoId, (pesos.get(alvoId) ?? 0) + e.pesoKg);
        volumes.set(alvoId, (volumes.get(alvoId) ?? 0) + (e.volumeM3 ?? 0));
      }

      if (!coube) continue;

      atuais = outras.map((r) => {
        const seq = destinos.get(r.id)!;
        if (seq.length === r.paradas.length) return r;
        const nova = montarRotaComSequencia(r.id, r.veiculo, seq, r.deposito ?? deposito, jornada);
        return { ...nova, rotulo: r.rotulo };
      });
      mexeu = true;
      break;
    }
  }

  return atuais;
}


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
  const comJanela = temJanelas(cluster.entregas);
  const seq = comJanela
    ? sequenciarComJanelas(cluster.entregas, deposito, veiculo.velocidadeMediaKmh)
    : refinar2opt(sequenciarVizinhoProximo(cluster.entregas, deposito), deposito, passadas2opt);

  return montarRotaComSequencia(id, veiculo, seq, deposito, jornada);
}

/** Monta a rota preservando exatamente a sequência informada (edição manual). */
export function montarRotaComSequencia(
  id: string,
  veiculo: PerfilVeiculo,
  seq: (Entrega & Coordenada)[],
  deposito: Deposito,
  jornada: RegrasJornada,
): Rota {
  const pesoKg = seq.reduce((s, e) => s + e.pesoKg, 0);
  const volumeM3 = seq.reduce((s, e) => s + (e.volumeM3 ?? 0), 0);
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
    deposito,
    pesoKg,
    volumeM3,
    ocupacaoPeso: veiculo.capacidadeKg ? pesoKg / veiculo.capacidadeKg : 0,
    custo: calcularCusto(veiculo, km, minutos),
    receita: 0,
    alertasJornada: [],
  };
  rota.alertasJornada = avaliarJornada(rota, jornada);
  return rota;
}

function gerarCenario(entrada: EntradaSimulacao, estrategia: Estrategia): Cenario {
  const { deposito, jornada } = entrada;
  const opcoes: OpcoesOtimizacao = { ...OPCOES_OTIMIZACAO_PADRAO, ...entrada.opcoes };
  const entregas = somenteGeocodificadas(entrada.entregas) as (Entrega & Coordenada)[];
  const frota = ordenarFrota(
    entrada.frota.filter((v) => v.disponiveis > 0),
    estrategia.preferencia,
  );

  const rotas: Rota[] = [];
  const usados: Record<string, number> = {};

  /** Escolhe o veículo da próxima rota olhando o peso ainda pendente. */
  const escolherParaLote = (pesoPendente: number) => {
    const livres = frota.filter((v) => (usados[v.id] ?? 0) < v.disponiveis);
    if (!livres.length) return null;
    if (estrategia.preferencia === "maior")
      return [...livres].sort((a, b) => b.capacidadeKg - a.capacidadeKg)[0];
    const eficientes = [...livres].sort(
      (a, b) => custoPorKm(a) / a.capacidadeKg - custoPorKm(b) / b.capacidadeKg,
    );
    // se há carga suficiente para lotar um veículo, usa o mais eficiente por kg
    const lotaveis = eficientes.filter((v) => v.capacidadeKg <= pesoPendente);
    if (lotaveis.length) return lotaveis[0];
    // sobra pequena: menor veículo que ainda comporta o restante
    const porCapacidade = [...livres].sort((a, b) => a.capacidadeKg - b.capacidadeKg);
    return porCapacidade.find((v) => v.capacidadeKg >= pesoPendente) ?? porCapacidade[porCapacidade.length - 1];
  };

  /**
   * Zoneamento: as entregas são agrupadas por região (Norte, Sul, Leste,
   * Oeste, Centro) e cada zona é lotada por peso antes de passar à próxima.
   */
  const comRegiao = entregas.some((e) => e.regiaoCodigo)
    ? entregas
    : identificarRegioes(entregas);

  const pools = new Map<string, (Entrega & Coordenada)[]>();
  for (const e of comRegiao) {
    const chave = e.regiaoCodigo ?? "sem_zona";
    const lista = pools.get(chave) ?? [];
    lista.push(e);
    pools.set(chave, lista);
  }
  const pesoDe = (lista: (Entrega & Coordenada)[]) => lista.reduce((s, e) => s + e.pesoKg, 0);

  // raio de vizinhança usado para redistribuir carga entre zonas limítrofes
  const centro = centroide(comRegiao);
  const dispersao = comRegiao
    .map((e) => distanciaKm(centro, e))
    .sort((a, b) => a - b)[Math.floor(comRegiao.length / 2)] ?? 0;
  const raioVizinhoKm = Math.max(2, dispersao * 0.45);

  /** Puxa entregas de outras zonas que estejam próximas da rota e caibam no peso. */
  const puxarVizinhos = (
    seq: (Entrega & Coordenada)[],
    capacidadeRestante: number,
    maxEntregas: number | undefined,
    zonaAtual: string,
  ) => {
    let restante = capacidadeRestante;
    for (;;) {
      if (maxEntregas && seq.length >= maxEntregas) break;
      let melhorZona = "";
      let melhorIdx = -1;
      let melhorPos = 0;
      let melhorDelta = Infinity;
      for (const [zona, lista] of pools) {
        if (zona === zonaAtual) continue;
        for (let i = 0; i < lista.length; i++) {
          const e = lista[i];
          if (e.pesoKg > restante) continue;
          let dMin = Infinity;
          for (const s of seq) dMin = Math.min(dMin, distanciaKm(s, e));
          if (dMin > raioVizinhoKm) continue;
          const { posicao, delta } = melhorInsercao(seq, e, deposito);
          if (delta < melhorDelta) {
            melhorDelta = delta;
            melhorZona = zona;
            melhorIdx = i;
            melhorPos = posicao;
          }
        }
      }
      if (melhorIdx < 0) break;
      const lista = pools.get(melhorZona);
      if (!lista) break;
      const [e] = lista.splice(melhorIdx, 1);
      seq.splice(melhorPos, 0, { ...e, origemAlocacao: "proximidade" });
      restante -= e.pesoKg;
    }
  };

  let indice = 0;
  let semVeiculo = false;
  // zonas mais pesadas primeiro (consomem os veículos mais eficientes)
  const zonas = [...pools.keys()].sort((a, b) => pesoDe(pools.get(b)!) - pesoDe(pools.get(a)!));

  for (const zona of zonas) {
    if (semVeiculo) break;
    for (;;) {
      const lista = pools.get(zona)!;
      if (!lista.length) break;
      const veiculo = escolherParaLote(pesoDe(lista));
      if (!veiculo) {
        semVeiculo = true;
        break;
      }
      // o cenário de "menor tempo" espalha a carga; os demais enchem o veículo
      const fator = estrategia.id === "tempo" ? estrategia.ocupacaoAlvo : 1;
      const limiteKg = Math.min(
        veiculo.capacidadeKg,
        Math.max(Math.min(...lista.map((e) => e.pesoKg)), veiculo.capacidadeKg * fator),
      );
      const limiteM3 = opcoes.ignorarCubagem ? undefined : veiculo.capacidadeM3;

      let seq: (Entrega & Coordenada)[];
      let restantes: (Entrega & Coordenada)[];
      if (opcoes.modo === "setor") {
        const [primeiro, ...resto] = agruparPorSetor(
          lista,
          deposito,
          limiteKg,
          limiteM3 ?? 0,
          veiculo.maxEntregas,
        );
        seq = primeiro?.entregas ?? [];
        restantes = resto.flatMap((c) => c.entregas);
      } else {
        const r = montarSequenciaPorPeso(lista, deposito, limiteKg, veiculo.maxEntregas, limiteM3);
        seq = r.seq;
        restantes = r.restantes;
      }
      if (!seq.length) break;
      seq = seq.map((e) => ({ ...e, origemAlocacao: e.origemAlocacao ?? "zona" }));
      pools.set(zona, restantes);

      // redistribuição entre zonas: sobrou peso disponível? puxa vizinhos próximos
      const pesoSeq = seq.reduce((s, e) => s + e.pesoKg, 0);
      const folga = limiteKg - pesoSeq;
      if (folga > veiculo.capacidadeKg * 0.08) puxarVizinhos(seq, folga, veiculo.maxEntregas, zona);

      usados[veiculo.id] = (usados[veiculo.id] ?? 0) + 1;
      indice += 1;
      const cluster: Cluster = {
        entregas: seq,
        pesoKg: seq.reduce((s, e) => s + e.pesoKg, 0),
        volumeM3: seq.reduce((s, e) => s + (e.volumeM3 ?? 0), 0),
      };
      rotas.push(
        montarRota(
          `${estrategia.id}-${indice}`,
          veiculo,
          cluster,
          deposito,
          jornada,
          estrategia.passadas2opt,
        ),
      );
    }
  }


  const pendentes: (Entrega & Coordenada)[] = [...pools.values()].flat();

  // Reaproveitamento: tenta encaixar sobras em rotas que ainda têm folga de peso.
  const naoAtendidas: Entrega[] = [];
  for (const bruta of pendentes) {
    const e = { ...bruta, origemAlocacao: "sobra" as const };
    let melhorIdx = -1;
    let melhorPos = 0;
    let melhorDelta = Infinity;
    rotas.forEach((r, i) => {
      if (r.pesoKg + e.pesoKg > r.veiculo.capacidadeKg) return;
      if (!opcoes.ignorarCubagem && r.volumeM3 + (e.volumeM3 ?? 0) > r.veiculo.capacidadeM3) return;
      if (r.veiculo.maxEntregas && r.paradas.length >= r.veiculo.maxEntregas) return;
      const seq = r.paradas.map((p) => p.entrega).filter(temCoordenada);
      const { posicao, delta } = melhorInsercao(seq, e, r.deposito ?? deposito);
      if (delta < melhorDelta) {
        melhorDelta = delta;
        melhorIdx = i;
        melhorPos = posicao;
      }
    });
    if (melhorIdx < 0) {
      naoAtendidas.push(bruta);
      continue;
    }
    const alvo = rotas[melhorIdx];
    const seq = alvo.paradas.map((p) => p.entrega).filter(temCoordenada);
    seq.splice(melhorPos, 0, e);
    rotas[melhorIdx] = montarRotaComSequencia(
      alvo.id,
      alvo.veiculo,
      seq,
      alvo.deposito ?? deposito,
      jornada,
    );
  }

  // Pós-otimização: reduz veículos com baixa ocupação de peso.
  if (opcoes.consolidarRotas) {
    const consolidadas = consolidarRotasOciosas(rotas, deposito, jornada, opcoes);
    rotas.splice(0, rotas.length, ...consolidadas);
  }


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
