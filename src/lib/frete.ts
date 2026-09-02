import { supabase } from "@/integrations/supabase/client";

/** ------------------------------------------------------------------
 *  Tabelas de frete, apuração da viagem e fechamentos.
 *  Toda a regra financeira (cliente x motorista) mora aqui.
 *  ------------------------------------------------------------------ */

export type Tipologia = {
  id: string;
  codigo: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

export type FreteDestino = "cliente" | "motorista";

export type FreteFaixa = {
  id: string;
  tabela_id: string;
  km_min: number;
  km_max: number;
  descricao: string | null;
  ordem: number;
};

export type FretePreco = {
  id: string;
  faixa_id: string;
  tipologia_id: string;
  valor: number;
};

export type FreteTabela = {
  id: string;
  cliente_id: string;
  destino: FreteDestino;
  ativo: boolean;
};

export type ViagemAjuste = {
  id: string;
  viagem_id: string;
  tipo: "desconto" | "adicional";
  descricao: string;
  valor_cliente: number;
  valor_motorista: number;
};

export const brl = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBR = (d: string | null | undefined) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";

/** Converte texto do formulário (já normalizado com ponto) em número. */
export const nnum = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const rotuloFaixa = (f: Pick<FreteFaixa, "km_min" | "km_max" | "descricao">) =>
  f.descricao?.trim() ? f.descricao : `${f.km_min} a ${f.km_max} km`;

/** ------------------------------------------------------------------
 *  Cálculo centralizado da apuração de uma viagem.
 *  ------------------------------------------------------------------ */

export type LadoApuracao = {
  frete: number;
  pedagio: number;
  adicionais: number;
  descontos: number;
  total: number;
};

export type ApuracaoViagem = { cliente: LadoApuracao; motorista: LadoApuracao };

export type EntradaApuracao = {
  freteCliente?: number | null;
  freteMotorista?: number | null;
  pedagioCliente?: number | null;
  pedagioMotorista?: number | null;
  ajustes?: Pick<ViagemAjuste, "tipo" | "valor_cliente" | "valor_motorista">[];
};

export function apurarViagem(e: EntradaApuracao): ApuracaoViagem {
  const ajustes = e.ajustes ?? [];
  const somar = (tipo: "desconto" | "adicional", lado: "cliente" | "motorista") =>
    ajustes
      .filter((a) => a.tipo === tipo)
      .reduce((s, a) => s + nnum(lado === "cliente" ? a.valor_cliente : a.valor_motorista), 0);

  const lado = (frete: number, pedagio: number, adicionais: number, descontos: number): LadoApuracao => ({
    frete,
    pedagio,
    adicionais,
    descontos,
    total: frete + pedagio + adicionais - descontos,
  });

  return {
    cliente: lado(
      nnum(e.freteCliente),
      nnum(e.pedagioCliente),
      somar("adicional", "cliente"),
      somar("desconto", "cliente"),
    ),
    motorista: lado(
      nnum(e.freteMotorista),
      nnum(e.pedagioMotorista),
      somar("adicional", "motorista"),
      somar("desconto", "motorista"),
    ),
  };
}

/** ------------------------------------------------------------------
 *  Consultas
 *  ------------------------------------------------------------------ */

export async function listarTipologias() {
  const { data, error } = await supabase
    .from("tipologias_veiculo")
    .select("id, codigo, nome, ordem, ativo")
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as Tipologia[];
}

export type TabelaCompleta = {
  tabela: FreteTabela | null;
  faixas: FreteFaixa[];
  precos: FretePreco[];
};

export async function carregarTabela(clienteId: string, destino: FreteDestino): Promise<TabelaCompleta> {
  const { data: tab, error } = await supabase
    .from("frete_tabelas")
    .select("id, cliente_id, destino, ativo")
    .eq("cliente_id", clienteId)
    .eq("destino", destino)
    .maybeSingle();
  if (error) throw error;
  if (!tab) return { tabela: null, faixas: [], precos: [] };

  const fx = await supabase
    .from("frete_faixas")
    .select("id, tabela_id, km_min, km_max, descricao, ordem")
    .eq("tabela_id", tab.id)
    .order("ordem")
    .order("km_min");
  if (fx.error) throw fx.error;
  const faixas = (fx.data ?? []).map((f) => ({
    ...f,
    km_min: Number(f.km_min),
    km_max: Number(f.km_max),
  })) as FreteFaixa[];

  let precos: FretePreco[] = [];
  if (faixas.length) {
    const pr = await supabase
      .from("frete_precos")
      .select("id, faixa_id, tipologia_id, valor")
      .in("faixa_id", faixas.map((f) => f.id));
    if (pr.error) throw pr.error;
    precos = (pr.data ?? []).map((p) => ({ ...p, valor: Number(p.valor) })) as FretePreco[];
  }

  return { tabela: tab as FreteTabela, faixas, precos };
}

export async function garantirTabela(clienteId: string, destino: FreteDestino) {
  const existente = await supabase
    .from("frete_tabelas")
    .select("id")
    .eq("cliente_id", clienteId)
    .eq("destino", destino)
    .maybeSingle();
  if (existente.data?.id) return existente.data.id as string;
  const { data, error } = await supabase
    .from("frete_tabelas")
    .insert({ cliente_id: clienteId, destino })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Preço de uma faixa/tipologia dentro de um conjunto carregado. */
export const precoDe = (precos: FretePreco[], faixaId: string | null, tipologiaId: string | null) =>
  faixaId && tipologiaId
    ? (precos.find((p) => p.faixa_id === faixaId && p.tipologia_id === tipologiaId)?.valor ?? null)
    : null;

/** Encontra, na tabela do outro destino, a faixa equivalente por quilometragem. */
export const faixaEquivalente = (faixas: FreteFaixa[], referencia: FreteFaixa | null | undefined) =>
  referencia
    ? (faixas.find((f) => f.km_min === referencia.km_min && f.km_max === referencia.km_max) ??
      faixas.find((f) => referencia.km_min >= f.km_min && referencia.km_min < f.km_max) ??
      null)
    : null;

export async function listarAjustes(viagemId: string) {
  const { data, error } = await supabase
    .from("viagem_ajustes")
    .select("id, viagem_id, tipo, descricao, valor_cliente, valor_motorista")
    .eq("viagem_id", viagemId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((a) => ({
    ...a,
    valor_cliente: Number(a.valor_cliente),
    valor_motorista: Number(a.valor_motorista),
  })) as ViagemAjuste[];
}
