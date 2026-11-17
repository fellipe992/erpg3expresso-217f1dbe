import { supabase } from "@/integrations/supabase/client";

export type TipoFatura = "abastecimento" | "peca";

export type ItemFatura = {
  id: string;
  data: string;
  descricao: string;
  fornecedor: string | null;
  placa: string | null;
  valor: number;
  lancamentoId: string | null;
  lancamentoStatus: string | null;
  planoContaId: string | null;
  centroCusto: string | null;
};

const marcador = (numero: number) => ` | CONSOLIDADO NA FATURA DE FORNECEDOR #${numero}`;

/** Item pago individualmente não entra na fatura: nunca alteramos pagamentos já feitos. */
export function itemElegivel(i: Pick<ItemFatura, "lancamentoStatus">) {
  return i.lancamentoStatus !== "pago" && i.lancamentoStatus !== "cancelado";
}

export function resumirFatura(itens: ItemFatura[], selecionados: Set<string>) {
  const escolhidos = itens.filter((i) => selecionados.has(i.id) && itemElegivel(i));
  const total = Math.round(escolhidos.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  return { escolhidos, total };
}

export async function carregarItensFatura(tipo: TipoFatura, de: string, ate: string): Promise<ItemFatura[]> {
  const base =
    tipo === "abastecimento"
      ? supabase
          .from("abastecimentos")
          .select("id, data, hora, posto, combustivel, litros, valor_total, veiculo:veiculos(placa)")
      : supabase.from("pecas").select("id, data, fornecedor, descricao, quantidade, valor_total, veiculo:veiculos(placa)");
  const { data, error } = await base.gte("data", de).lte("data", ate).is("fatura_id", null).order("data");
  if (error) throw error;
  const linhas = (data ?? []) as any[];
  const ids = linhas.map((l) => l.id);
  const lancs = new Map<string, any>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ls, error: e2 } = await supabase
      .from("financeiro_lancamentos")
      .select("id, origem_id, status, plano_conta_id, centro_custo")
      .eq("origem", tipo)
      .in("origem_id", ids.slice(i, i + 200));
    if (e2) throw e2;
    for (const l of ls ?? []) lancs.set(String(l.origem_id), l);
  }
  return linhas.map((l) => {
    const lanc = lancs.get(l.id);
    const descricao =
      tipo === "abastecimento"
        ? `${(l.combustivel ?? "COMBUSTÍVEL").toUpperCase()} ${Number(l.litros ?? 0).toLocaleString("pt-BR")} L`
        : `${l.descricao}${Number(l.quantidade) !== 1 ? ` (${Number(l.quantidade).toLocaleString("pt-BR")}X)` : ""}`;
    return {
      id: l.id,
      data: l.data,
      descricao,
      fornecedor: (tipo === "abastecimento" ? l.posto : l.fornecedor) ?? null,
      placa: l.veiculo?.placa ?? null,
      valor: Number(l.valor_total ?? 0),
      lancamentoId: lanc?.id ?? null,
      lancamentoStatus: lanc?.status ?? null,
      planoContaId: lanc?.plano_conta_id ?? null,
      centroCusto: lanc?.centro_custo ?? null,
    };
  });
}

export type GerarFatura = {
  tipo: TipoFatura;
  periodo: { de: string; ate: string };
  fornecedor: string | null;
  vencimento: string;
  descricao: string;
  itens: ItemFatura[];
};

/** Gera uma conta a pagar unificada e retira do fluxo os lançamentos individuais (sem apagar nada). */
export async function gerarFatura(p: GerarFatura) {
  const itens = p.itens.filter(itemElegivel);
  if (!itens.length) throw new Error("Selecione ao menos um item.");
  if (!p.vencimento) throw new Error("Informe o vencimento.");
  const valor = Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100;
  const tabela = p.tipo === "abastecimento" ? "abastecimentos" : "pecas";

  // ninguém pode ter entrado em outra fatura enquanto a tela estava aberta
  const { data: ja } = await supabase.from(tabela).select("id").in("id", itens.map((i) => i.id)).not("fatura_id", "is", null);
  if (ja?.length) throw new Error(`${ja.length} item(ns) já foram faturados em outra fatura. Atualize a lista.`);

  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id ?? null;
  const { data: fat, error } = await supabase
    .from("faturas_fornecedor")
    .insert({
      tipo: p.tipo,
      fornecedor: p.fornecedor,
      periodo_inicio: p.periodo.de,
      periodo_fim: p.periodo.ate,
      vencimento: p.vencimento,
      descricao: p.descricao,
      valor,
      quantidade_itens: itens.length,
      created_by: uid,
    })
    .select("id, numero")
    .single();
  if (error) throw error;

  const unico = <T,>(xs: T[]) => (new Set(xs).size === 1 ? xs[0] : null);
  const lanc = await supabase
    .from("financeiro_lancamentos")
    .insert({
      tipo: "pagar",
      descricao: p.descricao,
      categoria: p.tipo === "abastecimento" ? "Combustível" : "Peças",
      centro_custo: unico(itens.map((i) => i.centroCusto)) ?? (p.tipo === "abastecimento" ? "Combustível" : "Manutenção"),
      plano_conta_id: unico(itens.map((i) => i.planoContaId)),
      valor,
      data_emissao: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      data_competencia: p.periodo.ate,
      data_vencimento: p.vencimento,
      status: "pendente",
      origem: "fatura_fornecedor",
      origem_id: fat.id,
      numero_documento: `FAT-${fat.numero}`,
      observacoes: `${itens.length} ${p.tipo === "abastecimento" ? "abastecimento(s)" : "peça(s)"}${p.fornecedor ? ` · ${p.fornecedor}` : ""}`,
      created_by: uid,
    })
    .select("id")
    .single();
  if (lanc.error) {
    await supabase.from("faturas_fornecedor").update({ status: "cancelada" }).eq("id", fat.id);
    throw lanc.error;
  }
  await supabase.from("faturas_fornecedor").update({ lancamento_id: lanc.data.id }).eq("id", fat.id);

  const vinc = await supabase.from(tabela).update({ fatura_id: fat.id }).in("id", itens.map((i) => i.id));
  if (vinc.error) throw vinc.error;

  // lançamentos individuais saem do fluxo, preservando a observação original
  const ids = itens.map((i) => i.lancamentoId).filter((x): x is string => !!x);
  if (ids.length) {
    const { data: atuais } = await supabase
      .from("financeiro_lancamentos")
      .select("id, observacoes")
      .in("id", ids)
      .in("status", ["pendente", "atrasado"]);
    for (const l of atuais ?? []) {
      const r = await supabase
        .from("financeiro_lancamentos")
        .update({ status: "cancelado", observacoes: `${l.observacoes ?? ""}${marcador(fat.numero)}` })
        .eq("id", l.id);
      if (r.error) throw r.error;
    }
  }
  return fat as { id: string; numero: number };
}

export async function cancelarFatura(faturaId: string) {
  const { data: fat, error } = await supabase
    .from("faturas_fornecedor")
    .select("id, numero, tipo, lancamento_id, lancamento:financeiro_lancamentos(status)")
    .eq("id", faturaId)
    .single();
  if (error) throw error;
  if ((fat as any).lancamento?.status === "pago") throw new Error("Esta fatura já foi paga. Estorne o pagamento antes de cancelar.");
  const { data: user } = await supabase.auth.getUser();
  if (fat.lancamento_id)
    await supabase.from("financeiro_lancamentos").update({ status: "cancelado" }).eq("id", fat.lancamento_id);

  const tabela = fat.tipo === "abastecimento" ? "abastecimentos" : "pecas";
  const { data: itens } = await supabase.from(tabela).select("id").eq("fatura_id", faturaId);
  const ids = (itens ?? []).map((i) => i.id);
  const m = marcador(fat.numero);
  if (ids.length) {
    const { data: lancs } = await supabase
      .from("financeiro_lancamentos")
      .select("id, observacoes")
      .eq("origem", fat.tipo)
      .in("origem_id", ids)
      .eq("status", "cancelado")
      .like("observacoes", `%${m}`);
    for (const l of lancs ?? []) {
      const obs = (l.observacoes ?? "").slice(0, -m.length);
      await supabase.from("financeiro_lancamentos").update({ status: "pendente", observacoes: obs || null }).eq("id", l.id);
    }
    await supabase.from(tabela).update({ fatura_id: null }).eq("fatura_id", faturaId);
  }
  const upd = await supabase
    .from("faturas_fornecedor")
    .update({ status: "cancelada", cancelado_em: new Date().toISOString(), cancelado_por: user.user?.id ?? null })
    .eq("id", faturaId);
  if (upd.error) throw upd.error;
}

export async function listarFaturas(tipo: TipoFatura) {
  const { data, error } = await supabase
    .from("faturas_fornecedor")
    .select("id, numero, fornecedor, periodo_inicio, periodo_fim, vencimento, descricao, valor, quantidade_itens, status, lancamento:financeiro_lancamentos(status)")
    .eq("tipo", tipo)
    .order("numero", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as any[];
}
