import { gerarPlano, type Plano } from "@/lib/roteirizacao/plano";
import type { Deposito, Entrega, OpcoesOtimizacao, PerfilVeiculo, RegrasJornada, Rota } from "@/lib/roteirizacao/tipos";

export type StatusEntrega = "pendente" | "entregue" | "devolucao_parcial" | "devolucao_total";

export const MOTIVOS_DEVOLUCAO = [
  "CLIENTE AUSENTE / FECHADO",
  "MERCADORIA AVARIADA",
  "PEDIDO CANCELADO / RECUSADO",
  "DIVERGÊNCIA DE NOTA / ITEM",
  "ENDEREÇO NÃO LOCALIZADO",
  "FALTA DE ESPAÇO NO RECEBIMENTO",
  "ATRASO NA JANELA DE ENTREGA",
  "OUTRO",
] as const;

export const UNIDADES_ITEM = ["UN", "CX", "KG", "PCT", "FD", "LT", "PAL"] as const;

export type ItemDevolucaoInput = {
  item_descricao: string;
  quantidade: number;
  unidade: string;
  motivo: string;
  observacoes?: string;
};

export type StatusParadaProjeto = {
  paradaId: string;
  viagemId: string;
  entregaOrigemId: string | null;
  cliente: string | null;
  endereco: string;
  nf: string | null;
  statusEntrega: StatusEntrega;
  motivoDevolucao: string | null;
  entregueEm: string | null;
  devolucaoEm: string | null;
};

/**
 * Re-roteiriza entregas com devolução total (100% não entregues) apenas entre
 * as rotas que ainda NÃO saíram para a rua (rotas não despachadas).
 *
 * Mantém intactas as rotas já despachadas e executa o motor VRP (Clarke-Wright +
 * busca local + LNS) sobre o conjunto combinado (paradas das rotas não despachadas
 * + entregas devolvidas), garantindo que:
 * - Cada devolução entre na rota mais próxima disponível;
 * - Caso uma rota atinja capacidade (peso/volume/maxEntregas), paradas mais
 *   distantes sejam rebalanceadas para rotas vizinhas.
 */
export function reoteirizarDevolucoes(params: {
  plano: Plano;
  devolvidas: Entrega[];
  rotasDespachadasIds: Set<string>;
  depositos: Deposito[];
  jornada: RegrasJornada;
  opcoes: OpcoesOtimizacao;
}): { plano: Plano; realocadas: number; naoAlocadas: number } {
  const { plano, devolvidas, rotasDespachadasIds, depositos, jornada, opcoes } = params;
  if (!devolvidas.length) {
    return { plano, realocadas: 0, naoAlocadas: 0 };
  }

  const devolvidasIds = new Set(devolvidas.map((d) => d.id));
  const rotasFixas = plano.rotas
    .filter((r) => rotasDespachadasIds.has(r.id))
    .map((r) => {
      const paradasRestantes = r.paradas.filter((p) => !devolvidasIds.has(p.entrega.id));
      return paradasRestantes.length === r.paradas.length ? r : { ...r, paradas: paradasRestantes };
    });
  const rotasAbertas = plano.rotas.filter((r) => !rotasDespachadasIds.has(r.id));

  if (!rotasAbertas.length) {
    const idsExistentes = new Set(plano.naoAtendidas.map((e) => e.id));
    const novasPendentes = devolvidas.filter((e) => !idsExistentes.has(e.id));
    return {
      plano: {
        ...plano,
        rotas: rotasFixas,
        naoAtendidas: [...plano.naoAtendidas, ...novasPendentes],
      },
      realocadas: 0,
      naoAlocadas: novasPendentes.length,
    };
  }

  // Reúne entregas das rotas ainda não despachadas + entregas devolvidas (sem duplicar)
  const porId = new Map<string, Entrega>();
  for (const r of rotasAbertas) {
    for (const p of r.paradas) porId.set(p.entrega.id, p.entrega);
  }
  for (const d of devolvidas) {
    porId.set(d.id, d);
  }
  const entregasCombinadas = [...porId.values()];

  // Monta a frota disponível exatamente com os veículos das rotas abertas
  const contagemPorVeiculo = new Map<string, { perfil: PerfilVeiculo; qtd: number }>();
  for (const r of rotasAbertas) {
    const atual = contagemPorVeiculo.get(r.veiculo.id);
    if (atual) atual.qtd += 1;
    else contagemPorVeiculo.set(r.veiculo.id, { perfil: r.veiculo, qtd: 1 });
  }
  const frotaAberta: PerfilVeiculo[] = [...contagemPorVeiculo.values()].map(({ perfil, qtd }) => ({
    ...perfil,
    disponiveis: qtd,
  }));

  const novoParcial = gerarPlano({
    entregas: entregasCombinadas,
    depositos,
    frota: frotaAberta,
    jornada,
    opcoes: { ...opcoes, modoCotacao: false },
  });

  // Garante IDs únicos nas novas rotas para não colidir com as rotas fixas
  const idsFixos = new Set(rotasFixas.map((r) => r.id));
  const novasRotas = novoParcial.rotas.map((r, idx) =>
    idsFixos.has(r.id) ? { ...r, id: `${r.id}-re-${idx + 1}` } : r,
  );

  const alocadasIds = new Set(novasRotas.flatMap((r) => r.paradas.map((p) => p.entrega.id)));
  const realocadas = devolvidas.filter((d) => alocadasIds.has(d.id)).length;
  const naoAlocadas = devolvidas.length - realocadas;

  const naoAtendidasIds = new Set(novoParcial.naoAtendidas.map((e) => e.id));
  const pendentesAntigas = plano.naoAtendidas.filter(
    (e) => !alocadasIds.has(e.id) && !naoAtendidasIds.has(e.id),
  );

  return {
    plano: {
      rotas: [...rotasFixas, ...novasRotas],
      naoAtendidas: [...pendentesAntigas, ...novoParcial.naoAtendidas],
      criadoEm: new Date().toISOString(),
    },
    realocadas,
    naoAlocadas,
  };
}

/**
 * Combina o mapa de rotas enviadas em memória/salvo no projeto com as paradas
 * já persistidas em `viagem_paradas`, garantindo que rotas despachadas antes de
 * reabrir o projeto continuem reconhecidas como enviadas.
 */
export function rotasEnviadasDoProjeto(
  rotas: Rota[],
  enviadasSalvas: Record<string, string>,
  paradasProjeto: StatusParadaProjeto[],
): Record<string, string> {
  const resultado: Record<string, string> = { ...enviadasSalvas };
  if (!paradasProjeto.length) return resultado;

  const porEntrega = new Map<string, StatusParadaProjeto>();
  for (const p of paradasProjeto) {
    if (p.entregaOrigemId) porEntrega.set(p.entregaOrigemId, p);
  }

  for (const r of rotas) {
    if (resultado[r.id] || !r.paradas.length) continue;
    const correspondencias = r.paradas
      .map((p) => porEntrega.get(p.entrega.id))
      .filter((p): p is StatusParadaProjeto => Boolean(p));
    if (!correspondencias.length) continue;
    const temParadaNaoDevolvida = correspondencias.some((p) => p.statusEntrega !== "devolucao_total");
    const todasNoBanco = correspondencias.length === r.paradas.length;
    if (temParadaNaoDevolvida || todasNoBanco) {
      resultado[r.id] = correspondencias[0]!.viagemId;
    }
  }

  return resultado;
}