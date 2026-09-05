import { supabase } from "@/integrations/supabase/client";
import { apurarViagem, nnum, rotuloFaixa, type ViagemAjuste } from "@/lib/frete";
import { diaLocal } from "@/hooks/use-bi-dados";

export type TipoFechamento = "cliente" | "motorista";

export type FiltrosFechamento = {
  clienteId?: string | null;
  motoristaId?: string | null;
  veiculoId?: string | null;
  de: string;
  ate: string;
};

export type LinhaFechamento = {
  viagemId: string;
  codigo: string | null;
  data: string;
  clienteId: string | null;
  cliente: string;
  motoristaId: string | null;
  motorista: string;
  veiculoId: string | null;
  placa: string;
  tipologia: string;
  origem: string;
  destino: string;
  raio: string;
  frete: number;
  pedagio: number;
  adicionais: number;
  descontos: number;
  total: number;
  ajustes: ViagemAjuste[];
  fechamentoNumero: number | null;
  fechadoCliente: number | null;
  fechadoMotorista: number | null;
};

/** Dia-calendário no fuso da operação (evita jogar viagens da noite para o dia seguinte). */
const dia = (v: string | null | undefined) => diaLocal(v);

/**
 * Dia em que a viagem aconteceu: usa a saída real, depois a saída prevista e
 * só cai na data de lançamento quando a viagem não tem nenhuma data de operação.
 */
const diaOperacao = (v: {
  data_saida?: string | null;
  data_prevista_saida?: string | null;
  created_at?: string | null;
}) => dia(v.data_saida ?? v.data_prevista_saida ?? v.created_at);

/** Viagens elegíveis a fechamento, já apuradas pelo lado escolhido. */
export async function carregarViagensFechamento(
  tipo: TipoFechamento,
  f: FiltrosFechamento,
): Promise<LinhaFechamento[]> {
  let q = supabase
    .from("viagens")
    .select(
      "id, codigo, status, created_at, data_saida, data_chegada, data_prevista_saida, origem_cidade, origem_uf, destino_cidade, destino_uf, valor_frete, frete_motorista, pedagio_cliente, pedagio_motorista, frete_faixa_id, cliente_id, motorista_id, veiculo_id, cliente:clientes(razao_social), motorista:motoristas(nome), veiculo:veiculos(placa, tipo, tipologia_id)",
    )
    .neq("status", "cancelada")
    .order("data_saida", { ascending: true });

  if (f.clienteId) q = q.eq("cliente_id", f.clienteId);
  if (f.motoristaId) q = q.eq("motorista_id", f.motoristaId);
  if (f.veiculoId) q = q.eq("veiculo_id", f.veiculoId);

  const { data, error } = await q;
  if (error) throw error;

  const viagens = (data ?? []).filter((v) => {
    const d = diaOperacao(v);
    return d >= f.de && d <= f.ate;
  });
  if (!viagens.length) return [];

  const ids = viagens.map((v) => String(v.id));
  const [ajRes, fvRes, tipRes, faixaRes] = await Promise.all([
    supabase
      .from("viagem_ajustes")
      .select("id, viagem_id, tipo, descricao, valor_cliente, valor_motorista")
      .in("viagem_id", ids),
    supabase
      .from("fechamento_viagens")
      .select("viagem_id, tipo, ativo, fechamento:fechamentos(numero, status)")
      .in("viagem_id", ids)
      .eq("ativo", true),
    supabase.from("tipologias_veiculo").select("id, codigo, nome"),
    supabase.from("frete_faixas").select("id, km_min, km_max, descricao"),
  ]);
  if (ajRes.error) throw ajRes.error;

  const ajustesPorViagem = new Map<string, ViagemAjuste[]>();
  for (const a of ajRes.data ?? []) {
    const item = {
      ...a,
      valor_cliente: Number(a.valor_cliente),
      valor_motorista: Number(a.valor_motorista),
    } as ViagemAjuste;
    ajustesPorViagem.set(item.viagem_id, [...(ajustesPorViagem.get(item.viagem_id) ?? []), item]);
  }

  const fechados = new Map<string, { cliente: number | null; motorista: number | null }>();
  for (const r of (fvRes.data ?? []) as any[]) {
    const atual = fechados.get(String(r.viagem_id)) ?? { cliente: null, motorista: null };
    const numero = r.fechamento?.numero ?? null;
    if (r.tipo === "cliente") atual.cliente = numero;
    else atual.motorista = numero;
    fechados.set(String(r.viagem_id), atual);
  }

  const tipoNome = new Map<string, string>();
  const tipoPorCodigo = new Map<string, string>();
  for (const t of (tipRes.data ?? []) as any[]) {
    tipoNome.set(String(t.id), String(t.nome));
    tipoPorCodigo.set(String(t.codigo), String(t.nome));
  }
  const faixaRotulo = new Map<string, string>();
  for (const fx of (faixaRes.data ?? []) as any[]) {
    faixaRotulo.set(
      String(fx.id),
      rotuloFaixa({ km_min: Number(fx.km_min), km_max: Number(fx.km_max), descricao: fx.descricao }),
    );
  }

  return viagens.map((v) => {
    const ajustes = ajustesPorViagem.get(String(v.id)) ?? [];
    const ap = apurarViagem({
      freteCliente: nnum(v.valor_frete),
      freteMotorista: nnum(v.frete_motorista),
      pedagioCliente: nnum(v.pedagio_cliente),
      pedagioMotorista: nnum(v.pedagio_motorista),
      ajustes,
    });
    const lado = tipo === "cliente" ? ap.cliente : ap.motorista;
    const veic = (v.veiculo ?? null) as { placa?: string; tipo?: string; tipologia_id?: string } | null;
    const fech = fechados.get(String(v.id)) ?? { cliente: null, motorista: null };
    return {
      viagemId: String(v.id),
      codigo: (v.codigo as string) ?? null,
      data: diaOperacao(v),
      clienteId: (v.cliente_id as string) ?? null,
      cliente: (v.cliente as any)?.razao_social ?? "—",
      motoristaId: (v.motorista_id as string) ?? null,
      motorista: (v.motorista as any)?.nome ?? "—",
      veiculoId: (v.veiculo_id as string) ?? null,
      placa: veic?.placa ?? "—",
      tipologia:
        (veic?.tipologia_id ? tipoNome.get(veic.tipologia_id) : undefined) ??
        (veic?.tipo ? (tipoPorCodigo.get(veic.tipo) ?? veic.tipo) : "—"),
      origem: [v.origem_cidade, v.origem_uf].filter(Boolean).join("/") || "—",
      destino: [v.destino_cidade, v.destino_uf].filter(Boolean).join("/") || "—",
      raio: v.frete_faixa_id ? (faixaRotulo.get(String(v.frete_faixa_id)) ?? "—") : "—",
      frete: lado.frete,
      pedagio: lado.pedagio,
      adicionais: lado.adicionais,
      descontos: lado.descontos,
      total: lado.total,
      ajustes,
      fechamentoNumero: tipo === "cliente" ? fech.cliente : fech.motorista,
      fechadoCliente: fech.cliente,
      fechadoMotorista: fech.motorista,
    };
  });
}

export type DescontoExtra = { descricao: string; valor: number };

export type ConfirmarFechamento = {
  tipo: TipoFechamento;
  linhas: LinhaFechamento[];
  descricao: string;
  vencimento: string | null;
  periodo: { de: string; ate: string };
  descontosExtras: DescontoExtra[];
  clienteId: string | null;
  motoristaId: string | null;
  veiculoId: string | null;
};

/**
 * Cria o fechamento, vincula as viagens e gera o lançamento financeiro.
 * As viagens NUNCA são alteradas nem apagadas — só ganham o vínculo.
 */
export async function confirmarFechamento(p: ConfirmarFechamento) {
  if (!p.linhas.length) throw new Error("Selecione ao menos uma viagem.");

  // Idempotência: nenhuma viagem pode estar em outro fechamento ativo do mesmo tipo.
  const { data: jaFechadas, error: erroCheck } = await supabase
    .from("fechamento_viagens")
    .select("viagem_id, fechamento:fechamentos(numero)")
    .eq("ativo", true)
    .eq("tipo", p.tipo)
    .in("viagem_id", p.linhas.map((l) => l.viagemId));
  if (erroCheck) throw erroCheck;
  if (jaFechadas?.length) {
    const numeros = Array.from(new Set(jaFechadas.map((r: any) => r.fechamento?.numero).filter(Boolean)));
    throw new Error(
      `Algumas viagens selecionadas já pertencem ao fechamento #${numeros.join(", #")}. Remova-as da seleção.`,
    );
  }

  const valorViagens = p.linhas.reduce((s, l) => s + l.total, 0);
  const totalExtras = p.descontosExtras.reduce((s, d) => s + nnum(d.valor), 0);
  const valorFinal = valorViagens - totalExtras;

  // Em fechamento por cliente, preserve o motorista quando todas as viagens
  // selecionadas pertencem à mesma pessoa. Assim o vínculo não depende do
  // filtro opcional de motorista usado na tela.
  const motoristasDasViagens = Array.from(
    new Set(p.linhas.map((linha) => linha.motoristaId).filter((id): id is string => Boolean(id))),
  );
  const motoristaVinculado = p.motoristaId ?? (motoristasDasViagens.length === 1 ? motoristasDasViagens[0] : null);

  const veiculosDasViagens = Array.from(
    new Set(p.linhas.map((linha) => linha.veiculoId).filter((id): id is string => Boolean(id))),
  );
  const veiculoVinculado = p.veiculoId ?? (veiculosDasViagens.length === 1 ? veiculosDasViagens[0] : null);

  const { data: user } = await supabase.auth.getUser();
  const uid = user.user?.id ?? null;

  const { data: fech, error } = await supabase
    .from("fechamentos")
    .insert({
      tipo: p.tipo,
      cliente_id: p.clienteId,
      motorista_id: motoristaVinculado,
      veiculo_id: veiculoVinculado,
      periodo_inicio: p.periodo.de,
      periodo_fim: p.periodo.ate,
      descricao: p.descricao,
      vencimento: p.vencimento,
      valor: valorFinal,
      valor_viagens: valorViagens,
      valor_descontos_extras: totalExtras,
      created_by: uid,
    })
    .select("id, numero")
    .single();
  if (error) throw error;

  const itens = p.linhas.map((l) => ({
    fechamento_id: fech.id,
    viagem_id: l.viagemId,
    tipo: p.tipo,
    frete: l.frete,
    pedagio: l.pedagio,
    adicionais: l.adicionais,
    descontos: l.descontos,
    total: l.total,
  }));
  const itensRes = await supabase.from("fechamento_viagens").insert(itens);
  if (itensRes.error) {
    await supabase.from("fechamentos").delete().eq("id", fech.id);
    throw itensRes.error;
  }

  if (p.descontosExtras.length) {
    await supabase.from("fechamento_descontos").insert(
      p.descontosExtras.map((d) => ({
        fechamento_id: fech.id,
        descricao: d.descricao,
        valor: nnum(d.valor),
        created_by: uid,
      })),
    );
  }

  // Lançamento financeiro consolidado
  const clienteUnico =
    p.clienteId ?? (new Set(p.linhas.map((l) => l.clienteId)).size === 1 ? p.linhas[0].clienteId : null);
  const motoristaUnico =
    p.motoristaId ?? (new Set(p.linhas.map((l) => l.motoristaId)).size === 1 ? p.linhas[0].motoristaId : null);

  const lanc = await supabase
    .from("financeiro_lancamentos")
    .insert({
      tipo: p.tipo === "cliente" ? "receber" : "pagar",
      descricao: p.descricao,
      categoria: p.tipo === "cliente" ? "Frete" : "Frete motorista",
      centro_custo: p.tipo === "cliente" ? "Receita Operacional" : "Operacional",
      valor: valorFinal,
      data_emissao: new Date().toISOString().slice(0, 10),
      data_vencimento: p.vencimento,
      status: "pendente",
      cliente_id: clienteUnico,
      motorista_id: motoristaUnico,
      veiculo_id: p.veiculoId,
      origem: "fechamento",
      origem_id: fech.id,
      fechamento_id: fech.id,
      numero_documento: `FECH-${fech.numero}`,
      created_by: uid,
    })
    .select("id")
    .single();
  if (lanc.error) throw lanc.error;

  await supabase.from("fechamentos").update({ lancamento_id: lanc.data.id }).eq("id", fech.id);

  // Consolidação: os "a receber" individuais das viagens saem do fluxo (sem apagar nada).
  if (p.tipo === "cliente") {
    await supabase
      .from("financeiro_lancamentos")
      .update({
        status: "cancelado",
        observacoes: `Consolidado na fatura do fechamento #${fech.numero}`,
      })
      .in("viagem_id", p.linhas.map((l) => l.viagemId))
      .eq("tipo", "receber")
      .in("status", ["pendente", "atrasado"])
      .is("fechamento_id", null);
  }

  return fech as { id: string; numero: number };
}

/** Cancela um fechamento: solta as viagens e cancela o lançamento gerado. Nada é apagado. */
export async function cancelarFechamento(fechamentoId: string) {
  const { data: user } = await supabase.auth.getUser();
  const { data: fech, error } = await supabase
    .from("fechamentos")
    .select("id, numero, lancamento_id")
    .eq("id", fechamentoId)
    .single();
  if (error) throw error;

  await supabase.from("fechamento_viagens").update({ ativo: false }).eq("fechamento_id", fechamentoId);
  if (fech.lancamento_id) {
    await supabase.from("financeiro_lancamentos").update({ status: "cancelado" }).eq("id", fech.lancamento_id);
  }
  const upd = await supabase
    .from("fechamentos")
    .update({ status: "cancelado", cancelado_em: new Date().toISOString(), cancelado_por: user.user?.id ?? null })
    .eq("id", fechamentoId);
  if (upd.error) throw upd.error;
}

export type FechamentoRegistro = {
  id: string;
  numero: number;
  tipo: TipoFechamento;
  cliente_id: string | null;
  motorista_id: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  descricao: string;
  vencimento: string | null;
  valor: number;
  valor_viagens: number;
  valor_descontos_extras: number;
  status: string;
  created_at: string;
  cliente?: { razao_social: string } | null;
  motorista?: { nome: string } | null;
};

export async function listarFechamentos() {
  const { data, error } = await supabase
    .from("fechamentos")
    .select(
      "id, numero, tipo, cliente_id, motorista_id, periodo_inicio, periodo_fim, descricao, vencimento, valor, valor_viagens, valor_descontos_extras, status, created_at, cliente:clientes(razao_social), motorista:motoristas(nome)",
    )
    .order("numero", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FechamentoRegistro[];
}

export type DetalheFechamento = {
  fechamento: FechamentoRegistro;
  linhas: LinhaFechamento[];
  extras: DescontoExtra[];
};

/** Detalhe completo (para relatório): viagens do fechamento com valores gravados. */
export async function carregarDetalheFechamento(fechamentoId: string): Promise<DetalheFechamento> {
  const { data: fech, error } = await supabase
    .from("fechamentos")
    .select(
      "id, numero, tipo, cliente_id, motorista_id, periodo_inicio, periodo_fim, descricao, vencimento, valor, valor_viagens, valor_descontos_extras, status, created_at, cliente:clientes(razao_social), motorista:motoristas(nome)",
    )
    .eq("id", fechamentoId)
    .single();
  if (error) throw error;
  const registro = fech as unknown as FechamentoRegistro;

  const [itensRes, extrasRes] = await Promise.all([
    supabase
      .from("fechamento_viagens")
      .select(
        "viagem_id, frete, pedagio, adicionais, descontos, total, viagem:viagens(codigo, created_at, data_saida, data_prevista_saida, origem_cidade, origem_uf, destino_cidade, destino_uf, frete_faixa_id, cliente:clientes(razao_social), motorista:motoristas(nome), veiculo:veiculos(placa, tipo, tipologia_id))",
      )
      .eq("fechamento_id", fechamentoId),
    supabase.from("fechamento_descontos").select("descricao, valor").eq("fechamento_id", fechamentoId),
  ]);
  if (itensRes.error) throw itensRes.error;

  const viagemIds = (itensRes.data ?? []).map((i: any) => String(i.viagem_id));
  const [ajRes, tipRes, faixaRes] = await Promise.all([
    viagemIds.length
      ? supabase
          .from("viagem_ajustes")
          .select("id, viagem_id, tipo, descricao, valor_cliente, valor_motorista")
          .in("viagem_id", viagemIds)
      : Promise.resolve({ data: [], error: null } as any),
    supabase.from("tipologias_veiculo").select("id, codigo, nome"),
    supabase.from("frete_faixas").select("id, km_min, km_max, descricao"),
  ]);

  const ajustesPorViagem = new Map<string, ViagemAjuste[]>();
  for (const a of (ajRes.data ?? []) as any[]) {
    const item = {
      ...a,
      valor_cliente: Number(a.valor_cliente),
      valor_motorista: Number(a.valor_motorista),
    } as ViagemAjuste;
    ajustesPorViagem.set(item.viagem_id, [...(ajustesPorViagem.get(item.viagem_id) ?? []), item]);
  }
  const tipoNome = new Map<string, string>();
  const tipoPorCodigo = new Map<string, string>();
  for (const t of (tipRes.data ?? []) as any[]) {
    tipoNome.set(String(t.id), String(t.nome));
    tipoPorCodigo.set(String(t.codigo), String(t.nome));
  }
  const faixaRotulo = new Map<string, string>();
  for (const fx of (faixaRes.data ?? []) as any[]) {
    faixaRotulo.set(
      String(fx.id),
      rotuloFaixa({ km_min: Number(fx.km_min), km_max: Number(fx.km_max), descricao: fx.descricao }),
    );
  }

  const linhas: LinhaFechamento[] = (itensRes.data ?? []).map((i: any) => {
    const v = i.viagem ?? {};
    const veic = v.veiculo ?? null;
    return {
      viagemId: String(i.viagem_id),
      codigo: v.codigo ?? null,
      data: diaOperacao(v),
      clienteId: registro.cliente_id,
      cliente: v.cliente?.razao_social ?? "—",
      motoristaId: registro.motorista_id,
      motorista: v.motorista?.nome ?? "—",
      veiculoId: null,
      placa: veic?.placa ?? "—",
      tipologia:
        (veic?.tipologia_id ? tipoNome.get(veic.tipologia_id) : undefined) ??
        (veic?.tipo ? (tipoPorCodigo.get(veic.tipo) ?? veic.tipo) : "—"),
      origem: [v.origem_cidade, v.origem_uf].filter(Boolean).join("/") || "—",
      destino: [v.destino_cidade, v.destino_uf].filter(Boolean).join("/") || "—",
      raio: v.frete_faixa_id ? (faixaRotulo.get(String(v.frete_faixa_id)) ?? "—") : "—",
      frete: Number(i.frete),
      pedagio: Number(i.pedagio),
      adicionais: Number(i.adicionais),
      descontos: Number(i.descontos),
      total: Number(i.total),
      ajustes: ajustesPorViagem.get(String(i.viagem_id)) ?? [],
      fechamentoNumero: registro.numero,
      fechadoCliente: null,
      fechadoMotorista: null,
    };
  });

  return {
    fechamento: registro,
    linhas: linhas.sort((a, b) => a.data.localeCompare(b.data)),
    extras: ((extrasRes.data ?? []) as any[]).map((e) => ({ descricao: e.descricao, valor: Number(e.valor) })),
  };
}
