/**
 * Motor de roteirização (VRP capacitado) usado pelos cenários.
 *
 * 1. Construção por economias (Clarke-Wright): cada entrega começa sozinha e
 *    as rotas são unidas pelos pares que mais economizam quilômetros. Pontos
 *    distantes (ex.: Santos, Campinas) acabam encadeados com as entregas que
 *    ficam no caminho, formando rotas compactas.
 * 2. Atribuição de veículos respeitando disponibilidade, peso, cubagem,
 *    máximo de notas e duração da jornada.
 * 3. Busca local entre rotas (realocação e troca) + 2-opt/or-opt dentro da
 *    rota, que desfaz rotas que se cruzam ou misturam regiões.
 * 4. Consolidação de rotas ociosas somente quando reduz o custo total.
 */
import { distanciaKm } from "./geo";
import { pausasObrigatoriasMin } from "./jornada";
import { agruparPorSetor } from "./otimizador";
import type { Coordenada, Deposito, Entrega, OrigemAlocacao, PerfilVeiculo, RegrasJornada } from "./tipos";

export type PontoVrp = Entrega & Coordenada;

export type ConfigVrp = {
  deposito: Deposito;
  jornada: RegrasJornada;
  /** fração da capacidade de peso usada como teto por rota (0-1) */
  fatorCapacidade: number;
  ignorarCubagem: boolean;
  /** duração máxima (min) de uma rota com mais de uma entrega */
  limiteMin: number;
  /** duração aceita só para encaixar sobras quando a frota acabou (hora extra) */
  limiteSobraMin?: number;
  modo: "insercao" | "setor";
  /** "custo" escolhe o veículo mais barato; "menor" o de menor capacidade */
  preferencia: "custo" | "menor";
  /** objetivo da busca local: só km, ou custo (km + veículos) */
  objetivo: "km" | "custo";
  /** consolidar rotas abaixo desta ocupação de peso (0 = não consolidar) */
  ocupacaoMinima: number;
  raioProximidadeKm: number | null;
  custo: (v: PerfilVeiculo, km: number, minutos: number) => number;
  /** custo (R$ ou km) por vizinha próxima alocada em outro veículo */
  pesoMistura?: number;
  orcamentoMs?: number;
};

export type RotaVrp = { veiculo: PerfilVeiculo; seq: PontoVrp[] };
export type ResultadoVrp = { rotas: RotaVrp[]; pendentes: PontoVrp[] };

type R = {
  id: number;
  seq: number[];
  peso: number;
  vol: number;
  desc: number;
  km: number;
  tipo: PerfilVeiculo | null;
};

const EPS = 1e-6;

export function resolverVrp(
  entregas: PontoVrp[],
  frota: PerfilVeiculo[],
  cfg: ConfigVrp,
): ResultadoVrp {
  const N = entregas.length;
  if (!N || !frota.length) return { rotas: [], pendentes: [...entregas] };
  const inicio = Date.now();
  const orcamento = cfg.orcamentoMs ?? (N <= 150 ? 900 : 500);
  const tempoEsgotado = () => Date.now() - inicio > orcamento;

  // ---------- malha de distâncias (0 = depósito) ----------
  const pts: Coordenada[] = [cfg.deposito, ...entregas];
  const M = N + 1;
  const usarMatriz = M <= 1600;
  const matriz = usarMatriz ? new Float32Array(M * M) : null;
  if (matriz) {
    for (let i = 0; i < M; i++)
      for (let j = i + 1; j < M; j++) {
        const v = distanciaKm(pts[i], pts[j]);
        matriz[i * M + j] = v;
        matriz[j * M + i] = v;
      }
  }
  const d = (i: number, j: number) =>
    i === j ? 0 : matriz ? matriz[i * M + j] : distanciaKm(pts[i], pts[j]);
  const peso = (k: number) => entregas[k - 1].pesoKg;
  const vol = (k: number) => entregas[k - 1].volumeM3 ?? 0;
  const desc = (k: number) => entregas[k - 1].tempoDescargaMin;
  const origem = new Map<number, OrigemAlocacao>();

  // vizinhos mais próximos de cada entrega (limita o custo em malhas grandes)
  const K = Math.min(N - 1, N <= 300 ? N - 1 : 40);
  const vizinhos: number[][] = [[]];
  for (let i = 1; i <= N; i++) {
    const outros: number[] = [];
    for (let j = 1; j <= N; j++) if (j !== i) outros.push(j);
    outros.sort((a, b) => d(i, a) - d(i, b));
    vizinhos.push(outros.slice(0, K));
  }

  // ---------- regras de capacidade e jornada ----------
  const minutosDe = (km: number, descarga: number, tipo: PerfilVeiculo) => {
    const direcao = (km / Math.max(5, tipo.velocidadeMediaKmh)) * 60;
    return direcao + descarga + pausasObrigatoriasMin(direcao, cfg.jornada);
  };
  let limiteAtual = cfg.limiteMin;
  const cabe = (tipo: PerfilVeiculo, n: number, p: number, v: number, km: number, ds: number) => {
    if (n === 0) return true;
    const tetoKg = n === 1 ? tipo.capacidadeKg : tipo.capacidadeKg * cfg.fatorCapacidade;
    if (p > tetoKg + EPS) return false;
    if (!cfg.ignorarCubagem && tipo.capacidadeM3 > 0 && v > tipo.capacidadeM3 + EPS) return false;
    if (tipo.maxEntregas && n > tipo.maxEntregas) return false;
    if (n > 1 && minutosDe(km, ds, tipo) > limiteAtual) return false;
    return true;
  };
  const custoRota = (tipo: PerfilVeiculo, km: number, ds: number) =>
    cfg.custo(tipo, km, minutosDe(km, ds, tipo));
  const melhorTipo = (
    tipos: PerfilVeiculo[],
    n: number,
    p: number,
    v: number,
    km: number,
    ds: number,
  ): PerfilVeiculo | null => {
    let melhor: PerfilVeiculo | null = null;
    let melhorValor = Infinity;
    for (const t of tipos) {
      if (!cabe(t, n, p, v, km, ds)) continue;
      const valor = cfg.preferencia === "menor" ? t.capacidadeKg : custoRota(t, km, ds);
      if (valor < melhorValor - EPS) {
        melhorValor = valor;
        melhor = t;
      }
    }
    return melhor;
  };
  const kmSeq = (seq: number[]) => {
    if (!seq.length) return 0;
    let km = d(0, seq[0]);
    for (let i = 0; i < seq.length - 1; i++) km += d(seq[i], seq[i + 1]);
    return km + d(seq[seq.length - 1], 0);
  };
  let proximoId = 0;
  const novaRota = (seq: number[], tipo: PerfilVeiculo | null = null): R => ({
    id: proximoId++,
    seq,
    peso: seq.reduce((s, k) => s + peso(k), 0),
    vol: seq.reduce((s, k) => s + vol(k), 0),
    desc: seq.reduce((s, k) => s + desc(k), 0),
    km: kmSeq(seq),
    tipo,
  });
  /** Objetivo da busca local: custo do veículo (ou só km). */
  const valorRota = (r: R) => {
    if (!r.seq.length) return 0;
    return cfg.objetivo === "km" || !r.tipo ? r.km : custoRota(r.tipo, r.km, r.desc);
  };

  /*
   * Penalidade de mistura: cada entrega "conhece" suas vizinhas mais próximas;
   * quando uma vizinha está em outro veículo, a malha fica misturada (rota de
   * cima do mapa passando no meio da rota de baixo). A busca local paga um
   * custo por vizinha estrangeira, o que separa as rotas em territórios.
   */
  const KV = Math.min(4, N - 1);
  const proximos = vizinhos.map((v) => v.slice(0, KV));
  const entram: number[][] = Array.from({ length: N + 1 }, () => []);
  for (let i = 1; i <= N; i++) for (const j of proximos[i]) entram[j].push(i);
  // a penalidade some com a distância: só vizinhas realmente próximas contam
  const nnOrdenado = vizinhos
    .slice(1)
    .map((v, i) => (v.length ? d(i + 1, v[0]) : 0))
    .sort((x, y) => x - y);
  const raioMistura = Math.max(1.5, 3 * (nnOrdenado[Math.floor(nnOrdenado.length / 2)] ?? 0));
  const pesoAresta = (i: number, j: number) => Math.max(0, 1 - d(i, j) / raioMistura);
  const dono = new Int32Array(N + 1).fill(-1);
  const pesoMistura = cfg.pesoMistura ?? 20;
  const deltaMistura = (mudancas: Map<number, number>) => {
    if (!pesoMistura || !mudancas.size) return 0;
    const novo = (k: number) => mudancas.get(k) ?? dono[k];
    const visto = new Set<number>();
    let delta = 0;
    const aresta = (i: number, j: number) => {
      const chave = i * (N + 1) + j;
      if (visto.has(chave)) return;
      visto.add(chave);
      delta += ((novo(i) !== novo(j) ? 1 : 0) - (dono[i] !== dono[j] ? 1 : 0)) * pesoAresta(i, j);
    };
    for (const x of mudancas.keys()) {
      for (const j of proximos[x]) aresta(x, j);
      for (const j of entram[x]) aresta(j, x);
    }
    return delta * pesoMistura;
  };
  const aplicarDonos = (mudancas: Map<number, number>) => {
    for (const [k, id] of mudancas) dono[k] = id;
  };
  const sincronizarDonos = (rotas: R[]) => {
    dono.fill(-1);
    for (const r of rotas) for (const k of r.seq) dono[k] = r.id;
  };
  const misturaDe = (rotas: R[]) => {
    const local = new Int32Array(N + 1).fill(-1);
    rotas.forEach((r) => r.seq.forEach((k) => (local[k] = r.id)));
    let n = 0;
    for (let i = 1; i <= N; i++)
      for (const j of proximos[i]) if (local[i] !== local[j]) n += pesoAresta(i, j);
    return n * pesoMistura;
  };

  // ---------- 1. construção ----------
  const economias = (nos: number[], tipos: PerfilVeiculo[], lambda: number): R[] => {
    const rotaDe = new Map<number, R>();
    for (const k of nos) rotaDe.set(k, novaRota([k]));
    const dentro = new Set(nos);
    const pares: [number, number, number][] = [];
    for (const i of nos)
      for (const j of vizinhos[i]) {
        if (!dentro.has(j) || (j < i && vizinhos[j].includes(i))) continue;
        const s = d(0, i) + d(0, j) - lambda * d(i, j);
        if (s > 0) pares.push([s, i, j]);
      }
    pares.sort((a, b) => b[0] - a[0]);
    for (const [, i, j] of pares) {
      const a = rotaDe.get(i)!;
      const b = rotaDe.get(j)!;
      if (a === b) continue;
      const ai = a.seq[0] === i ? 0 : a.seq[a.seq.length - 1] === i ? 1 : -1;
      const bj = b.seq[0] === j ? 0 : b.seq[b.seq.length - 1] === j ? 1 : -1;
      if (ai < 0 || bj < 0) continue;
      const km = a.km + b.km - d(i, 0) - d(0, j) + d(i, j);
      const n = a.seq.length + b.seq.length;
      const p = a.peso + b.peso;
      const v = a.vol + b.vol;
      const ds = a.desc + b.desc;
      if (!tipos.some((t) => cabe(t, n, p, v, km, ds))) continue;
      const sa = ai === 1 ? a.seq : [...a.seq].reverse();
      const sb = bj === 0 ? b.seq : [...b.seq].reverse();
      a.seq = [...sa, ...sb];
      a.km = km;
      a.peso = p;
      a.vol = v;
      a.desc = ds;
      for (const k of sb) rotaDe.set(k, a);
    }
    return [...new Set(rotaDe.values())];
  };

  const setores = (nos: number[], tipos: PerfilVeiculo[]): R[] => {
    const tetoKg = Math.max(...tipos.map((t) => t.capacidadeKg)) * cfg.fatorCapacidade;
    const tetoM3 = cfg.ignorarCubagem ? 0 : Math.max(...tipos.map((t) => t.capacidadeM3));
    const limites = tipos.map((t) => t.maxEntregas ?? 0);
    const maxQtd = limites.some((l) => !l) ? undefined : Math.max(...limites);
    const idx = new Map(nos.map((k) => [entregas[k - 1].id, k]));
    return agruparPorSetor(nos.map((k) => entregas[k - 1]), cfg.deposito, tetoKg, tetoM3, maxQtd).map(
      (c) => novaRota(c.entregas.map((e) => idx.get(e.id)!)),
    );
  };

  const construir = (nos: number[], tipos: PerfilVeiculo[]): R[] => {
    if (cfg.modo === "setor") return setores(nos, tipos);
    const lambdas = nos.length <= 150 ? [1, 1.2, 1.5, 0.8] : nos.length <= 400 ? [1, 1.3] : [1];
    let melhor: R[] = [];
    let melhorValor = Infinity;
    for (const l of lambdas) {
      const rotas = economias(nos, tipos, l);
      const valor = rotas.reduce((s, r) => {
        const t = melhorTipo(tipos, r.seq.length, r.peso, r.vol, r.km, r.desc);
        return s + (t && cfg.objetivo === "custo" ? custoRota(t, r.km, r.desc) : r.km);
      }, 0) + misturaDe(rotas);
      if (valor < melhorValor) {
        melhorValor = valor;
        melhor = rotas;
      }
    }
    return melhor;
  };

  // ---------- 2. atribuição de veículos ----------
  const restante = new Map(frota.map((t) => [t.id, t.disponiveis]));
  const tiposLivres = () => frota.filter((t) => (restante.get(t.id) ?? 0) > 0);
  const finais: R[] = [];
  let pendentes = Array.from({ length: N }, (_, i) => i + 1);
  for (let volta = 0; volta < 6 && pendentes.length; volta++) {
    const tipos = tiposLivres();
    if (!tipos.length) break;
    const rotas = construir(pendentes, tipos).sort((a, b) => b.peso - a.peso);
    const sobra: number[] = [];
    for (const r of rotas) {
      const t = melhorTipo(tiposLivres(), r.seq.length, r.peso, r.vol, r.km, r.desc);
      if (!t) {
        sobra.push(...r.seq);
        continue;
      }
      restante.set(t.id, (restante.get(t.id) ?? 0) - 1);
      r.tipo = t;
      finais.push(r);
    }
    if (sobra.length === pendentes.length) break;
    pendentes = sobra;
  }
  for (const r of finais) for (const k of r.seq) origem.set(k, "zona");

  const cabeEm = (r: R, n: number, p: number, v: number, km: number, ds: number) =>
    !!r.tipo && cabe(r.tipo, n, p, v, km, ds);

  const melhorPosicao = (seq: number[], k: number) => {
    let pos = 0;
    let delta = Infinity;
    for (let i = 0; i <= seq.length; i++) {
      const a = i === 0 ? 0 : seq[i - 1];
      const b = i === seq.length ? 0 : seq[i];
      const x = d(a, k) + d(k, b) - d(a, b);
      if (x < delta) {
        delta = x;
        pos = i;
      }
    }
    return { pos, delta };
  };

  // reaproveitamento: encaixa sobras nas rotas que ainda comportam (pode usar hora extra)
  const naoAtendidos: number[] = [];
  limiteAtual = Math.max(cfg.limiteMin, cfg.limiteSobraMin ?? cfg.limiteMin);
  for (const k of pendentes) {
    let alvo: R | null = null;
    let alvoPos = 0;
    let alvoDelta = Infinity;
    for (const r of finais) {
      const { pos, delta } = melhorPosicao(r.seq, k);
      if (delta >= alvoDelta) continue;
      if (!cabeEm(r, r.seq.length + 1, r.peso + peso(k), r.vol + vol(k), r.km + delta, r.desc + desc(k)))
        continue;
      alvo = r;
      alvoPos = pos;
      alvoDelta = delta;
    }
    if (!alvo) {
      naoAtendidos.push(k);
      continue;
    }
    alvo.seq.splice(alvoPos, 0, k);
    alvo.km += alvoDelta;
    alvo.peso += peso(k);
    alvo.vol += vol(k);
    alvo.desc += desc(k);
    origem.set(k, "sobra");
  }

  limiteAtual = cfg.limiteMin;

  // ---------- 3. busca local ----------
  const doisOpt = (r: R) => {
    const s = r.seq;
    if (s.length < 3) return false;
    let mexeu = false;
    let melhorou = true;
    while (melhorou) {
      melhorou = false;
      for (let i = 0; i < s.length - 1; i++)
        for (let j = i + 1; j < s.length; j++) {
          const a = i === 0 ? 0 : s[i - 1];
          const b = j === s.length - 1 ? 0 : s[j + 1];
          const delta = d(a, s[j]) + d(s[i], b) - d(a, s[i]) - d(s[j], b);
          if (delta < -1e-4) {
            const trecho = s.slice(i, j + 1).reverse();
            s.splice(i, j - i + 1, ...trecho);
            melhorou = mexeu = true;
          }
        }
    }
    return mexeu;
  };
  const orOpt = (r: R) => {
    let mexeu = false;
    for (let tam = 1; tam <= 3; tam++) {
      for (let i = 0; i + tam <= r.seq.length; i++) {
        const s = r.seq;
        const a = i === 0 ? 0 : s[i - 1];
        const b = i + tam === s.length ? 0 : s[i + tam];
        const ganho = d(a, s[i]) + d(s[i + tam - 1], b) - d(a, b);
        const bloco = s.slice(i, i + tam);
        const resto = [...s.slice(0, i), ...s.slice(i + tam)];
        let melhor = -1;
        let melhorDelta = ganho - 1e-4;
        let inverter = false;
        for (let p = 0; p <= resto.length; p++) {
          if (p === i) continue;
          const x = p === 0 ? 0 : resto[p - 1];
          const y = p === resto.length ? 0 : resto[p];
          const direto = d(x, bloco[0]) + d(bloco[tam - 1], y) - d(x, y);
          const inverso = d(x, bloco[tam - 1]) + d(bloco[0], y) - d(x, y);
          if (direto < melhorDelta) {
            melhorDelta = direto;
            melhor = p;
            inverter = false;
          }
          if (inverso < melhorDelta) {
            melhorDelta = inverso;
            melhor = p;
            inverter = true;
          }
        }
        if (melhor >= 0) {
          const ins = inverter ? [...bloco].reverse() : bloco;
          r.seq = [...resto.slice(0, melhor), ...ins, ...resto.slice(melhor)];
          mexeu = true;
        }
      }
    }
    return mexeu;
  };
  const refinarInterno = (r: R) => {
    for (let i = 0; i < 4; i++) {
      const a = doisOpt(r);
      const b = orOpt(r);
      if (!a && !b) break;
    }
    r.km = kmSeq(r.seq);
  };

  const removerEm = (seq: number[], pos: number) => {
    const a = pos === 0 ? 0 : seq[pos - 1];
    const b = pos === seq.length - 1 ? 0 : seq[pos + 1];
    return d(a, seq[pos]) + d(seq[pos], b) - d(a, b);
  };

  /** Realoca uma entrega para outra rota quando reduz o objetivo. */
  const realocar = (rotas: R[]) => {
    let mexeu = false;
    const rotaDe = new Map<number, R>();
    rotas.forEach((r) => r.seq.forEach((k) => rotaDe.set(k, r)));
    for (let k = 1; k <= N; k++) {
      const a = rotaDe.get(k);
      if (!a || !a.tipo) continue;
      const pos = a.seq.indexOf(k);
      const kmA = a.km - removerEm(a.seq, pos);
      const antesA = valorRota(a);
      const novaA: R = {
        ...a,
        seq: a.seq.filter((x) => x !== k),
        km: kmA,
        peso: a.peso - peso(k),
        vol: a.vol - vol(k),
        desc: a.desc - desc(k),
      };
      const depoisA = valorRota(novaA);
      const candidatas =
        N <= 300 ? rotas : [...new Set(vizinhos[k].slice(0, 15).map((v) => rotaDe.get(v)).filter(Boolean) as R[])];
      let alvo: R | null = null;
      let alvoPos = 0;
      let alvoGanho = 1e-3;
      for (const b of candidatas) {
        if (b === a || !b.tipo) continue;
        const { pos: p, delta } = melhorPosicao(b.seq, k);
        const kmB = b.km + delta;
        if (!cabeEm(b, b.seq.length + 1, b.peso + peso(k), b.vol + vol(k), kmB, b.desc + desc(k))) continue;
        const seqB = [...b.seq.slice(0, p), k, ...b.seq.slice(p)];
        const depoisB = valorRota({ ...b, seq: seqB, km: kmB, desc: b.desc + desc(k) });
        const ganho =
          antesA + valorRota(b) - depoisA - depoisB - deltaMistura(new Map([[k, b.id]]));
        if (ganho > alvoGanho) {
          alvoGanho = ganho;
          alvo = b;
          alvoPos = p;
        }
      }
      if (!alvo) continue;
      Object.assign(a, novaA);
      alvo.seq.splice(alvoPos, 0, k);
      alvo.km = kmSeq(alvo.seq);
      alvo.peso += peso(k);
      alvo.vol += vol(k);
      alvo.desc += desc(k);
      rotaDe.set(k, alvo);
      aplicarDonos(new Map([[k, alvo.id]]));
      origem.set(k, "proximidade");
      mexeu = true;
    }
    return mexeu;
  };

  /** Troca duas entregas entre rotas diferentes quando reduz o objetivo. */
  const trocar = (rotas: R[]) => {
    if (N > 300) return false;
    let mexeu = false;
    for (let ia = 0; ia < rotas.length; ia++)
      for (let ib = ia + 1; ib < rotas.length; ib++) {
        const a = rotas[ia];
        const b = rotas[ib];
        if (!a.tipo || !b.tipo) continue;
        for (let pa = 0; pa < a.seq.length; pa++)
          for (let pb = 0; pb < b.seq.length; pb++) {
            if (tempoEsgotado()) return mexeu;
            const x = a.seq[pa];
            const y = b.seq[pb];
            const restoA = a.seq.filter((_, i) => i !== pa);
            const restoB = b.seq.filter((_, i) => i !== pb);
            const insA = melhorPosicao(restoA, y);
            const insB = melhorPosicao(restoB, x);
            const kmA = kmSeq(restoA) + insA.delta;
            const kmB = kmSeq(restoB) + insB.delta;
            const pA = a.peso - peso(x) + peso(y);
            const pB = b.peso - peso(y) + peso(x);
            const vA = a.vol - vol(x) + vol(y);
            const vB = b.vol - vol(y) + vol(x);
            const dA = a.desc - desc(x) + desc(y);
            const dB = b.desc - desc(y) + desc(x);
            if (!cabeEm(a, a.seq.length, pA, vA, kmA, dA) || !cabeEm(b, b.seq.length, pB, vB, kmB, dB)) continue;
            restoA.splice(insA.pos, 0, y);
            restoB.splice(insB.pos, 0, x);
            const antes = valorRota(a) + valorRota(b);
            const depois =
              valorRota({ ...a, seq: restoA, km: kmA, desc: dA }) +
              valorRota({ ...b, seq: restoB, km: kmB, desc: dB });
            const mud = new Map([
              [x, b.id],
              [y, a.id],
            ]);
            if (antes - depois - deltaMistura(mud) <= 1e-3) continue;
            aplicarDonos(mud);
            Object.assign(a, { seq: restoA, km: kmA, peso: pA, vol: vA, desc: dA });
            Object.assign(b, { seq: restoB, km: kmB, peso: pB, vol: vB, desc: dB });
            origem.set(x, "proximidade");
            origem.set(y, "proximidade");
            mexeu = true;
          }
      }
    return mexeu;
  };

  /**
   * 2-opt* entre rotas: troca os "rabos" de duas rotas (A[..i]+B[j..] e
   * B[..j]+A[i..]) — é o movimento que desfaz rotas que se cruzam no mapa.
   */
  const cruzar = (rotas: R[]) => {
    if (N > 400) return false;
    let mexeu = false;
    const soma = (seq: number[], f: (k: number) => number) => seq.reduce((s, k) => s + f(k), 0);
    for (let ia = 0; ia < rotas.length; ia++)
      for (let ib = ia + 1; ib < rotas.length; ib++) {
        if (tempoEsgotado()) return mexeu;
        const a = rotas[ia];
        const b = rotas[ib];
        if (!a.tipo || !b.tipo) continue;
        const antes = valorRota(a) + valorRota(b);
        let melhor: {
          sa: number[];
          sb: number[];
          ta: PerfilVeiculo;
          tb: PerfilVeiculo;
          ganho: number;
        } | null = null;
        const pares: [PerfilVeiculo, PerfilVeiculo][] =
          a.tipo.id === b.tipo.id ? [[a.tipo, b.tipo]] : [[a.tipo, b.tipo], [b.tipo, a.tipo]];
        for (let i = 0; i <= a.seq.length; i++)
          for (let j = 0; j <= b.seq.length; j++) {
            const opcoes = [
              [[...a.seq.slice(0, i), ...b.seq.slice(j)], [...b.seq.slice(0, j), ...a.seq.slice(i)]],
              [
                [...a.seq.slice(0, i), ...b.seq.slice(0, j).reverse()],
                [...a.seq.slice(i).reverse(), ...b.seq.slice(j)],
              ],
            ];
            for (const [sa, sb] of opcoes) {
              if (!sa.length && !sb.length) continue;
              if (sa.length === a.seq.length && sa.every((k, x) => k === a.seq[x])) continue;
              const kmA = kmSeq(sa);
              const kmB = kmSeq(sb);
              const dA = soma(sa, desc);
              const dB = soma(sb, desc);
              const pA = soma(sa, peso);
              const pB = soma(sb, peso);
              const vA = soma(sa, vol);
              const vB = soma(sb, vol);
              const mud = new Map<number, number>();
              for (const k of sa) if (dono[k] !== a.id) mud.set(k, a.id);
              for (const k of sb) if (dono[k] !== b.id) mud.set(k, b.id);
              const mistura = deltaMistura(mud);
              for (const [ta, tb] of pares) {
                if (!cabe(ta, sa.length, pA, vA, kmA, dA) || !cabe(tb, sb.length, pB, vB, kmB, dB)) continue;
                const depois =
                  valorRota({ ...a, tipo: ta, seq: sa, km: kmA, desc: dA }) +
                  valorRota({ ...b, tipo: tb, seq: sb, km: kmB, desc: dB });
                const ganho = antes - depois - mistura;
                if (ganho > 1e-3 && (!melhor || ganho > melhor.ganho)) melhor = { sa, sb, ta, tb, ganho };
              }
            }
          }
        if (!melhor) continue;
        const moveu = new Set(a.seq);
        for (const k of melhor.sb) if (moveu.has(k)) origem.set(k, "proximidade");
        for (const k of melhor.sa) if (!moveu.has(k)) origem.set(k, "proximidade");
        const mud = new Map<number, number>();
        for (const k of melhor.sa) mud.set(k, a.id);
        for (const k of melhor.sb) mud.set(k, b.id);
        aplicarDonos(mud);
        Object.assign(a, { ...novaRota(melhor.sa, melhor.ta), id: a.id });
        Object.assign(b, { ...novaRota(melhor.sb, melhor.tb), id: b.id });
        mexeu = true;
      }
    return mexeu;
  };

  /** Troca o veículo de cada rota pelo melhor tipo disponível que comporta a carga. */
  const reatribuirVeiculos = (rotas: R[]) => {
    const livre = new Map(frota.map((t) => [t.id, t.disponiveis]));
    for (const r of rotas) if (r.tipo) livre.set(r.tipo.id, (livre.get(r.tipo.id) ?? 0) - 1);
    for (const r of [...rotas].sort((a, b) => b.peso - a.peso)) {
      if (!r.tipo) continue;
      livre.set(r.tipo.id, (livre.get(r.tipo.id) ?? 0) + 1);
      const opcoes = frota.filter((t) => (livre.get(t.id) ?? 0) > 0);
      const t = melhorTipo(opcoes, r.seq.length, r.peso, r.vol, r.km, r.desc) ?? r.tipo;
      livre.set(t.id, (livre.get(t.id) ?? 0) - 1);
      r.tipo = t;
    }
  };

  const buscaLocal = (rotas: R[]) => {
    sincronizarDonos(rotas);
    rotas.forEach(refinarInterno);
    for (let passada = 0; passada < 30 && !tempoEsgotado(); passada++) {
      const a = realocar(rotas);
      const b = trocar(rotas);
      const c = cruzar(rotas);
      rotas.forEach(refinarInterno);
      for (let i = rotas.length - 1; i >= 0; i--) if (!rotas[i].seq.length) rotas.splice(i, 1);
      if (!a && !b && !c) break;
    }
    reatribuirVeiculos(rotas);
  };

  buscaLocal(finais);

  // ---------- 4. consolidação de rotas ociosas ----------
  if (cfg.ocupacaoMinima > 0 && finais.length > 1) {
    const raio = cfg.raioProximidadeKm && cfg.raioProximidadeKm > 0 ? cfg.raioProximidadeKm : null;
    let mexeu = true;
    for (let volta = 0; mexeu && volta < 6 && !tempoEsgotado(); volta++) {
      mexeu = false;
      const ociosas = finais
        .filter((r) => r.tipo && r.peso / r.tipo.capacidadeKg < cfg.ocupacaoMinima)
        .sort((a, b) => a.peso / a.tipo!.capacidadeKg - b.peso / b.tipo!.capacidadeKg);
      for (const ociosa of ociosas) {
        const outras = finais.filter((r) => r !== ociosa).map((r) => ({ ...r, seq: [...r.seq] }));
        let coube = true;
        for (const k of ociosa.seq) {
          let alvo: R | null = null;
          let alvoPos = 0;
          let alvoDelta = Infinity;
          for (const r of outras) {
            if (raio && !r.seq.some((s) => d(s, k) <= raio)) continue;
            const { pos, delta } = melhorPosicao(r.seq, k);
            if (delta >= alvoDelta) continue;
            if (!cabeEm(r, r.seq.length + 1, r.peso + peso(k), r.vol + vol(k), r.km + delta, r.desc + desc(k)))
              continue;
            alvo = r;
            alvoPos = pos;
            alvoDelta = delta;
          }
          if (!alvo) {
            coube = false;
            break;
          }
          alvo.seq.splice(alvoPos, 0, k);
          alvo.km += alvoDelta;
          alvo.peso += peso(k);
          alvo.vol += vol(k);
          alvo.desc += desc(k);
        }
        if (!coube) continue;
        outras.forEach(refinarInterno);
        const custoTotal = (lista: R[]) =>
          lista.reduce((s, r) => s + (r.tipo ? custoRota(r.tipo, r.km, r.desc) : 0), 0);
        if (custoTotal(outras) > custoTotal(finais) + EPS) continue;
        for (const k of ociosa.seq) origem.set(k, "consolidacao");
        finais.splice(0, finais.length, ...outras);
        mexeu = true;
        break;
      }
    }
    if (mexeu || finais.length) buscaLocal(finais);
  }

  return {
    rotas: finais
      .filter((r) => r.seq.length && r.tipo)
      .map((r) => ({
        veiculo: r.tipo!,
        seq: r.seq.map((k) => ({ ...entregas[k - 1], origemAlocacao: origem.get(k) ?? "zona" })),
      })),
    pendentes: naoAtendidos.map((k) => entregas[k - 1]),
  };
}
