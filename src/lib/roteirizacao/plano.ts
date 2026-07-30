import { montarRotaComSequencia, simularCenarios } from "./cenarios";
import { distanciaKm, temCoordenada } from "./geo";
import type {
  Coordenada,
  Deposito,
  Entrega,
  PerfilVeiculo,
  RegrasJornada,
  Rota,
} from "./tipos";

export type EntregaGeo = Entrega & Coordenada;

export type Plano = {
  rotas: Rota[];
  naoAtendidas: Entrega[];
  criadoEm: string;
};

export const planoVazio = (): Plano => ({ rotas: [], naoAtendidas: [], criadoEm: new Date().toISOString() });

/** Associa cada entrega ao centro de distribuição mais próximo/eficiente. */
export function associarDepositos(entregas: Entrega[], depositos: Deposito[]): Entrega[] {
  if (depositos.length === 0) return entregas;
  return entregas.map((e) => {
    if (e.depositoId && depositos.some((d) => d.id === e.depositoId)) return e;
    if (!temCoordenada(e)) return { ...e, depositoId: depositos[0].id };
    const melhor = depositos.reduce((a, b) =>
      distanciaKm(e as Coordenada, b) < distanciaKm(e as Coordenada, a) ? b : a,
    );
    return { ...e, depositoId: melhor.id };
  });
}

function rotularRotas(rotas: Rota[]): Rota[] {
  const contagem: Record<string, number> = {};
  return rotas.map((r) => {
    contagem[r.veiculo.id] = (contagem[r.veiculo.id] ?? 0) + 1;
    return { ...r, rotulo: `${r.veiculo.nome} ${contagem[r.veiculo.id]}` };
  });
}

export type EntradaPlano = {
  entregas: Entrega[];
  depositos: Deposito[];
  frota: PerfilVeiculo[];
  jornada: RegrasJornada;
};

/**
 * Distribui as entregas entre os veículos considerando múltiplos CDs:
 * cada CD roda a simulação de cenários e o cenário recomendado é consolidado.
 */
export function gerarPlano({ entregas, depositos, frota, jornada }: EntradaPlano): Plano {
  const comCd = associarDepositos(entregas, depositos);
  const rotas: Rota[] = [];
  const naoAtendidas: Entrega[] = [];

  for (const cd of depositos) {
    const doCd = comCd.filter((e) => e.depositoId === cd.id && temCoordenada(e));
    if (!doCd.length) continue;
    const { cenarios, recomendado } = simularCenarios({
      entregas: doCd,
      deposito: cd,
      frota,
      jornada,
    });
    const escolhido = cenarios.find((c) => c.id === recomendado) ?? cenarios[0];
    if (!escolhido) continue;
    rotas.push(...escolhido.rotas.map((r) => ({ ...r, deposito: cd })));
    naoAtendidas.push(...escolhido.entregasNaoAtendidas);
  }

  return { rotas: rotularRotas(rotas), naoAtendidas, criadoEm: new Date().toISOString() };
}

function seqDaRota(rota: Rota): EntregaGeo[] {
  return rota.paradas.map((p) => p.entrega).filter(temCoordenada);
}

export function recalcularRota(rota: Rota, seq: EntregaGeo[], jornada: RegrasJornada): Rota {
  const cd = rota.deposito;
  if (!cd) return rota;
  const nova = montarRotaComSequencia(rota.id, rota.veiculo, seq, cd, jornada);
  return { ...nova, rotulo: rota.rotulo };
}

/** Reordena uma entrega dentro da rota (drag & drop na lista). */
export function reordenar(plano: Plano, rotaId: string, de: number, para: number, jornada: RegrasJornada): Plano {
  return atualizarRota(plano, rotaId, (seq) => {
    const copia = [...seq];
    const [item] = copia.splice(de, 1);
    if (!item) return seq;
    copia.splice(Math.max(0, Math.min(copia.length, para)), 0, item);
    return copia;
  }, jornada);
}

function atualizarRota(
  plano: Plano,
  rotaId: string,
  fn: (seq: EntregaGeo[]) => EntregaGeo[],
  jornada: RegrasJornada,
): Plano {
  return {
    ...plano,
    rotas: plano.rotas.map((r) => (r.id === rotaId ? recalcularRota(r, fn(seqDaRota(r)), jornada) : r)),
  };
}

/** Move uma entrega para outro veículo (ou reposiciona dentro do mesmo). */
export function moverEntrega(
  plano: Plano,
  entregaId: string,
  rotaDestinoId: string,
  jornada: RegrasJornada,
  posicao?: number,
): Plano {
  let entrega: EntregaGeo | undefined;
  const semEntrega = plano.rotas.map((r) => {
    const seq = seqDaRota(r);
    const idx = seq.findIndex((e) => e.id === entregaId);
    if (idx < 0) return r;
    entrega = seq[idx];
    seq.splice(idx, 1);
    return recalcularRota(r, seq, jornada);
  });
  if (!entrega) {
    const pendente = plano.naoAtendidas.find((e) => e.id === entregaId);
    if (pendente && temCoordenada(pendente)) entrega = pendente;
  }
  if (!entrega) return plano;
  const alvo = entrega;
  return {
    ...plano,
    naoAtendidas: plano.naoAtendidas.filter((e) => e.id !== entregaId),
    rotas: semEntrega.map((r) => {
      if (r.id !== rotaDestinoId) return r;
      const seq = seqDaRota(r);
      seq.splice(posicao == null ? seq.length : Math.max(0, Math.min(seq.length, posicao)), 0, alvo);
      return recalcularRota(r, seq, jornada);
    }),
  };
}

export function removerEntrega(plano: Plano, entregaId: string, jornada: RegrasJornada): Plano {
  return {
    ...plano,
    naoAtendidas: plano.naoAtendidas.filter((e) => e.id !== entregaId),
    rotas: plano.rotas
      .map((r) => {
        const seq = seqDaRota(r).filter((e) => e.id !== entregaId);
        return seq.length === r.paradas.length ? r : recalcularRota(r, seq, jornada);
      })
      .filter((r) => r.paradas.length > 0),
  };
}

export function otimizarRota(plano: Plano, rotaId: string, jornada: RegrasJornada): Plano {
  return {
    ...plano,
    rotas: plano.rotas.map((r) => {
      if (r.id !== rotaId || !r.deposito) return r;
      const { montarRota } = requireCenarios();
      const cluster = {
        entregas: seqDaRota(r),
        pesoKg: r.pesoKg,
        volumeM3: r.volumeM3,
      };
      const nova = montarRota(r.id, r.veiculo, cluster, r.deposito, jornada, 4);
      return { ...nova, rotulo: r.rotulo };
    }),
  };
}

// import estático evitando ciclo de leitura no topo do arquivo
function requireCenarios() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return cenariosModule;
}
import * as cenariosModule from "./cenarios";

export function duplicarRota(plano: Plano, rotaId: string): Plano {
  const original = plano.rotas.find((r) => r.id === rotaId);
  if (!original) return plano;
  const copia: Rota = {
    ...original,
    id: `${original.id}-c${Math.random().toString(36).slice(2, 6)}`,
    rotulo: `${original.rotulo ?? original.veiculo.nome} (cópia)`,
    paradas: original.paradas.map((p) => ({ ...p, entrega: { ...p.entrega, id: crypto.randomUUID() } })),
  };
  return { ...plano, rotas: [...plano.rotas, copia] };
}

export function excluirRota(plano: Plano, rotaId: string): Plano {
  const rota = plano.rotas.find((r) => r.id === rotaId);
  if (!rota) return plano;
  return {
    ...plano,
    rotas: plano.rotas.filter((r) => r.id !== rotaId),
    naoAtendidas: [...plano.naoAtendidas, ...rota.paradas.map((p) => p.entrega)],
  };
}

export function mesclarRotas(plano: Plano, origemId: string, destinoId: string, jornada: RegrasJornada): Plano {
  const origem = plano.rotas.find((r) => r.id === origemId);
  const destino = plano.rotas.find((r) => r.id === destinoId);
  if (!origem || !destino || origemId === destinoId) return plano;
  const seq = [...seqDaRota(destino), ...seqDaRota(origem)];
  return {
    ...plano,
    rotas: plano.rotas
      .filter((r) => r.id !== origemId)
      .map((r) => (r.id === destinoId ? recalcularRota(r, seq, jornada) : r)),
  };
}

export function dividirRota(plano: Plano, rotaId: string, jornada: RegrasJornada): Plano {
  const rota = plano.rotas.find((r) => r.id === rotaId);
  if (!rota || rota.paradas.length < 2) return plano;
  const seq = seqDaRota(rota);
  const meio = Math.ceil(seq.length / 2);
  const nova: Rota = recalcularRota(
    {
      ...rota,
      id: `${rota.id}-d${Math.random().toString(36).slice(2, 6)}`,
      rotulo: `${rota.rotulo ?? rota.veiculo.nome} B`,
    },
    seq.slice(meio),
    jornada,
  );
  return {
    ...plano,
    rotas: [
      ...plano.rotas.map((r) => (r.id === rotaId ? recalcularRota(r, seq.slice(0, meio), jornada) : r)),
      nova,
    ],
  };
}

export function totaisPlano(plano: Plano) {
  const km = plano.rotas.reduce((s, r) => s + r.km, 0);
  const custo = plano.rotas.reduce((s, r) => s + r.custo.total, 0);
  const entregas = plano.rotas.reduce((s, r) => s + r.paradas.length, 0);
  const pesoKg = plano.rotas.reduce((s, r) => s + r.pesoKg, 0);
  const minutosOperacao = plano.rotas.length ? Math.max(...plano.rotas.map((r) => r.minutos)) : 0;
  const ocupacaoMedia = plano.rotas.length
    ? plano.rotas.reduce((s, r) => s + r.ocupacaoPeso, 0) / plano.rotas.length
    : 0;
  return { km, custo, entregas, pesoKg, minutosOperacao, ocupacaoMedia, veiculos: plano.rotas.length };
}
