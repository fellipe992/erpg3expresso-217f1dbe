import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AmbienteFiscal, EntradaCte, EntradaMdfe, StatusDocumentoFiscal } from "@/lib/fiscal-tipos";

const amb = (v: unknown): AmbienteFiscal => (v === "homologacao" ? "homologacao" : "producao");

const dig = (v: unknown) => String(v ?? "").replace(/\D+/g, "");
const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

type EmpresaEmitente = { id: string; inscricaoFederal: string; inscricaoEstadual: string; rntrc: string | null };

/** Escolhe a empresa emitente: a informada, senão a marcada como padrão, senão a mais antiga. */
async function empresaEmitente(
  supabase: { from: (t: string) => any },
  empresaId?: string | null,
): Promise<EmpresaEmitente> {
  let query = supabase.from("company_settings").select("*");
  if (empresaId) query = query.eq("id", empresaId);
  else query = query.eq("emitente_fiscal", true).eq("ativo", true).order("emitente_padrao", { ascending: false });
  const { data } = await query.order("created_at", { ascending: true }).limit(1).maybeSingle();

  const c = (data ?? {}) as Record<string, unknown>;
  const inscricaoFederal = dig(c["cnpj"]);
  const inscricaoEstadual = txt(c["inscricao_estadual"], 20);
  if (!inscricaoFederal || !inscricaoEstadual) {
    throw new Error(
      "Selecione a empresa emitente e complete o CNPJ e a inscrição estadual dela em Empresa antes de emitir documentos fiscais.",
    );
  }
  return {
    id: String(c["id"] ?? ""),
    inscricaoFederal,
    inscricaoEstadual,
    rntrc: txt(c["rntrc"], 8) || null,
  };
}

function envolvidoApi(e: EntradaCte["remetente"]) {
  return {
    nome: txt(e.nome, 60),
    inscricaoFederal: dig(e.inscricaoFederal),
    inscricaoEstadual: txt(e.inscricaoEstadual, 20) || undefined,
    telefone: dig(e.telefone),
    email: txt(e.email, 120) || undefined,
    endereco: {
      pais: "BRASIL",
      logradouro: txt(e.endereco.logradouro, 60),
      numero: txt(e.endereco.numero, 30),
      bairro: txt(e.endereco.bairro, 60),
      municipio: txt(e.endereco.municipio, 60),
      uf: txt(e.endereco.uf, 2).toUpperCase(),
      cep: dig(e.endereco.cep).slice(0, 8),
      complemento: txt(e.endereco.complemento, 60) || undefined,
    },
  };
}

function validarEnvolvido(e: EntradaCte["remetente"], rotulo: string) {
  const faltando: string[] = [];
  if (!txt(e?.nome)) faltando.push("nome");
  if (!dig(e?.inscricaoFederal)) faltando.push("CNPJ/CPF");
  if (!dig(e?.telefone)) faltando.push("telefone");
  const en = e?.endereco;
  if (!txt(en?.logradouro)) faltando.push("logradouro");
  if (!txt(en?.numero)) faltando.push("número");
  if (!txt(en?.bairro)) faltando.push("bairro");
  if (!txt(en?.municipio)) faltando.push("município");
  if (!txt(en?.uf)) faltando.push("UF");
  if (!dig(en?.cep)) faltando.push("CEP");
  if (faltando.length) throw new Error(`${rotulo}: informe ${faltando.join(", ")}.`);
}

/** Estado da integração e dos dados da empresa emitente. */
export const statusIntegracaoFiscal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getCredenciais } = await import("@/lib/fiscal.server");
    const { configurado } = await getCredenciais(context.supabase, "producao");
    const homologacao = await getCredenciais(context.supabase, "homologacao");
    const { data } = await context.supabase
      .from("company_settings")
      .select("id, nome_fantasia, razao_social, cnpj, inscricao_estadual, rntrc, emitente_fiscal, emitente_padrao, ativo")
      .eq("emitente_fiscal", true)
      .eq("ativo", true)
      .order("emitente_padrao", { ascending: false })
      .order("created_at", { ascending: true });
    const emitentes = (data ?? []).map((c) => ({
      id: String(c.id),
      nome: txt(c.razao_social || c.nome_fantasia, 120),
      cnpj: dig(c.cnpj) || null,
      inscricaoEstadual: txt(c.inscricao_estadual, 20) || null,
      rntrc: txt(c.rntrc, 8) || null,
      padrao: !!c.emitente_padrao,
      completo: !!dig(c.cnpj) && !!txt(c.inscricao_estadual),
    }));
    const principal = emitentes[0] ?? null;
    return {
      configurado,
      homologacaoConfigurada: homologacao.configurado,
      homologacaoPropria: homologacao.homologacaoPropria,
      emitentes,
      empresaOk: !!principal?.completo,
      cnpj: principal?.cnpj ?? null,
      inscricaoEstadual: principal?.inscricaoEstadual ?? null,
      rntrc: principal?.rntrc ?? null,
    };
  });

/** Cria o CT-e na Bsoft e envia para autorização (fluxo assíncrono). */
export const emitirCte = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: EntradaCte) => {
    if (!data) throw new Error("Dados do CT-e não informados.");
    validarEnvolvido(data.remetente, "Remetente");
    validarEnvolvido(data.destinatario, "Destinatário");
    validarEnvolvido(data.tomador, "Tomador");
    if (!(Number(data.freteValor) > 0)) throw new Error("Informe o valor do frete.");
    if (!(Number(data.pesoKg) > 0)) throw new Error("Informe o peso da carga em kg.");
    if (!txt(data.produtoPredominante)) throw new Error("Informe o produto predominante.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { bsoft, codigoAmbiente } = await import("@/lib/fiscal.server");
    const empresa = await empresaEmitente(context.supabase as never, data.empresaId ?? null);
    const ambiente = amb(data.ambiente);

    const adicionais = (data.adicionais ?? []).filter((a) => txt(a.nome) && Number(a.valor) > 0);
    const outrosFretes = [
      ...(Number(data.pedagio) > 0 ? [{ nomeFrete: "Pedágio", valorFrete: Number(data.pedagio) }] : []),
      ...adicionais.map((a) => ({ nomeFrete: txt(a.nome, 40), valorFrete: Number(a.valor) })),
    ];
    const valorTotal =
      Number(data.freteValor) + outrosFretes.reduce((s, o) => s + o.valorFrete, 0) + Number(data.fretePeso ?? 0);

    const { data: doc, error } = await context.supabase
      .from("fiscal_documentos")
      .insert({
        tipo: "cte",
        status: "rascunho",
        ambiente,
        empresa_id: empresa.id || null,
        valor: valorTotal,
        peso_kg: Number(data.pesoKg),
        produto_predominante: txt(data.produtoPredominante, 120),
        cliente_id: data.clienteId ?? null,
        viagem_id: data.viagemId ?? null,
        fechamento_id: data.fechamentoId ?? null,
        veiculo_id: data.veiculoId ?? null,
        motorista_id: data.motoristaId ?? null,
        observacoes: txt(data.observacao, 500) || null,
        created_by: context.userId,
      })
      .select("id, id_integracao")
      .single();
    if (error || !doc) throw new Error(error?.message ?? "Não foi possível registrar o CT-e.");

    const payload = {
      idIntegracao: doc.id_integracao,
      empresa: { inscricaoFederal: empresa.inscricaoFederal, inscricaoEstadual: empresa.inscricaoEstadual },
      remetente: envolvidoApi(data.remetente),
      destinatario: { ...envolvidoApi(data.destinatario), consumidorFinal: false },
      tomador: { ...envolvidoApi(data.tomador), atividade: data.atividadeTomador ?? "SERVICO" },
      frete: {
        freteValor: Number(data.freteValor),
        fretePeso: Number(data.fretePeso ?? 0) || undefined,
        outrosFretes: outrosFretes.length ? outrosFretes : undefined,
      },
      carga: {
        valorTotal: Number(data.cargaValor) > 0 ? Number(data.cargaValor) : valorTotal,
        produtoPredominante: txt(data.produtoPredominante, 120),
        medidas: {
          unidades: Number(data.unidades ?? 0) || undefined,
          pesoBrutoKG: Number(data.pesoKg),
        },
      },
      documentos: { chaveAcessoNFe: (data.chavesNfe ?? []).map((c) => dig(c)).filter((c) => c.length === 44) },
      tipoTransporte: { tipoTransporte: "RODOVIARIO" },
      ambiente: codigoAmbiente(ambiente),
      observacaoGeral: txt(data.observacao, 500) || undefined,
    };

    try {
      const criado = await bsoft(context.supabase, "cte", "/v1/integracoes/cte", { method: "POST", body: payload, ambiente });
      const bsoftId = criado?.id;
      if (!bsoftId) throw new Error("A Bsoft não retornou o identificador do CT-e criado.");

      const emissao = await bsoft(context.supabase, "cte", "/v1/integracoes/ctes/emitir", {
        method: "POST",
        body: { idList: [bsoftId], enviarEmail: !!data.enviarEmail, averbarCte: false },
        ambiente,
      });
      const transacao = emissao?.idTransacao ?? emissao?.id ?? null;

      await context.supabase
        .from("fiscal_documentos")
        .update({ bsoft_id: bsoftId, transacao_id: transacao, status: "processando", payload, motivo: null })
        .eq("id", doc.id);

      return { id: doc.id as string, bsoftId, transacaoId: transacao };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "Falha desconhecida";
      await context.supabase
        .from("fiscal_documentos")
        .update({ status: "rejeitado", motivo: motivo.slice(0, 2000), payload })
        .eq("id", doc.id);
      throw e;
    }
  });

/** Consulta o status/resultado na Bsoft e atualiza o registro local. */
export const sincronizarDocumentoFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Documento não informado.");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }) => {
    const { bsoft } = await import("@/lib/fiscal.server");
    const { data: doc } = await context.supabase
      .from("fiscal_documentos")
      .select("id, tipo, bsoft_id, transacao_id, status, ambiente")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("Documento não encontrado.");
    if (!doc.bsoft_id) throw new Error("Documento ainda não enviado à Bsoft.");

    const produto = doc.tipo === "cte" ? "cte" : "mdfe";
    const base = produto === "cte" ? "/v1/integracoes/ctes" : "/v1/integracoes/mdfes";
    const ambiente = amb(doc.ambiente);

    // Resultado da transação assíncrona (quando existe).
    let itens: Array<Record<string, unknown>> = [];
    if (doc.transacao_id) {
      try {
        const res = await bsoft(context.supabase, produto, `${base}/emitir/${doc.transacao_id}/obter-resultado`, { ambiente });
        itens = Array.isArray(res) ? (res as Array<Record<string, unknown>>) : [];
      } catch {
        itens = [];
      }
    }

    // Situação atual do documento.
    let detalhe: Record<string, unknown> | null = null;
    try {
      detalhe = await bsoft<Record<string, unknown>>(produto, `${base}/${doc.bsoft_id}`, { ambiente });
    } catch {
      detalhe = null;
    }

    const item = itens[0] ?? {};
    const bruto = String(
      (detalhe?.["statusCte"] as string) ??
        (detalhe?.["statusMdfe"] as string) ??
        (detalhe?.["status"] as string) ??
        (item["statusOperacao"] as string) ??
        "",
    ).toUpperCase();

    let status: StatusDocumentoFiscal = doc.status as StatusDocumentoFiscal;
    if (bruto.includes("AUTORIZ")) status = "autorizado";
    else if (bruto.includes("CANCEL")) status = "cancelado";
    else if (bruto.includes("ENCERR")) status = "encerrado";
    else if (bruto.includes("REJEIT") || bruto.includes("DENEG") || item["sucesso"] === false) status = "rejeitado";
    else if (bruto.includes("PROCESS") || bruto.includes("TRANSMI")) status = "processando";

    const numero = (detalhe?.["numero"] ?? item["numero"] ?? null) as string | number | null;
    const serie = (detalhe?.["serie"] ?? item["serie"] ?? null) as string | number | null;
    const chave = (detalhe?.["chaveAcesso"] ?? detalhe?.["chave"] ?? null) as string | null;
    const motivo = (item["motivo"] ?? detalhe?.["motivo"] ?? detalhe?.["mensagemSefaz"] ?? null) as string | null;

    await context.supabase
      .from("fiscal_documentos")
      .update({
        status,
        numero: numero != null ? String(numero) : null,
        serie: serie != null ? String(serie) : null,
        chave_acesso: chave ? String(chave) : null,
        motivo: motivo ? String(motivo).slice(0, 2000) : null,
        resultado: JSON.parse(JSON.stringify({ detalhe, itens })),
      })
      .eq("id", doc.id);

    return { status, numero, serie, chave, motivo };
  });

/** Gera o DACTE/DAMDFE e o XML do documento. */
export const baixarDocumentoFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Documento não informado.");
    return { id: String(data.id) };
  })
  .handler(async ({ data, context }) => {
    const { bsoft } = await import("@/lib/fiscal.server");
    const { data: doc } = await context.supabase
      .from("fiscal_documentos")
      .select("id, tipo, bsoft_id, ambiente")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc?.bsoft_id) throw new Error("Documento ainda não emitido na Bsoft.");

    const b64 = (bytes: unknown) => {
      if (typeof bytes === "string" && bytes.length > 100) return bytes;
      if (Array.isArray(bytes) && bytes.length) {
        return Buffer.from(Uint8Array.from(bytes as number[])).toString("base64");
      }
      return null;
    };

    if (doc.tipo === "cte") {
      const r = await bsoft<Record<string, unknown>>("cte", "/v1/integracoes/ctes/imprimir-documento-cte", {
        method: "POST",
        body: { idCteList: [doc.bsoft_id], ordenarPorIntegracao: true },
        ambiente: amb(doc.ambiente),
      });
      return { url: (r?.["url"] as string) || null, pdf: b64(r?.["bytesDacteCte"]), xml: b64(r?.["bytesXmlCte"]) };
    }

    const r = await bsoft<Record<string, unknown>>("mdfe", "/v1/integracoes/mdfes/imprimir-documento-mdfe", {
      method: "POST",
      body: { idMdfeList: [doc.bsoft_id], ordenarPorIntegracao: true },
      ambiente: amb(doc.ambiente),
    });
    return { url: (r?.["url"] as string) || null, pdf: b64(r?.["bytesDacteMdfe"]), xml: b64(r?.["bytesXmlMdfe"]) };
  });

/** Cancela o documento na SEFAZ através da Bsoft. */
export const cancelarDocumentoFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; motivo: string }) => {
    const motivo = txt(data?.motivo, 255);
    if (motivo.length < 15) throw new Error("A SEFAZ exige um motivo de cancelamento com no mínimo 15 caracteres.");
    if (!data?.id) throw new Error("Documento não informado.");
    return { id: String(data.id), motivo };
  })
  .handler(async ({ data, context }) => {
    const { bsoft } = await import("@/lib/fiscal.server");
    const { data: doc } = await context.supabase
      .from("fiscal_documentos")
      .select("id, tipo, bsoft_id, ambiente")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc?.bsoft_id) throw new Error("Documento ainda não emitido na Bsoft.");

    const agora = new Date().toISOString();
    if (doc.tipo === "cte") {
      await bsoft(context.supabase, "cte", "/v1/integracoes/cte/cancelar", {
        method: "POST",
        body: { idList: [doc.bsoft_id], motivoCancelamento: data.motivo, dataAtual: agora },
        ambiente: amb(doc.ambiente),
      });
    } else {
      await bsoft(context.supabase, "mdfe", "/v1/integracoes/mdfes/cancelar", {
        method: "POST",
        body: { idMdfeList: [doc.bsoft_id], motivoCancelamento: data.motivo, dataCancelamento: agora },
        ambiente: amb(doc.ambiente),
      });
    }

    await context.supabase
      .from("fiscal_documentos")
      .update({ status: "cancelado", motivo: data.motivo })
      .eq("id", doc.id);
    return { ok: true };
  });

/** Cria e emite o MDF-e agrupando CT-es autorizados. */
export const emitirMdfe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: EntradaMdfe) => {
    if (!data?.cteIds?.length) throw new Error("Selecione ao menos um CT-e autorizado.");
    if (!txt(data.inicio?.municipio) || !txt(data.inicio?.uf)) throw new Error("Informe o município/UF de início.");
    if (!txt(data.termino?.municipio) || !txt(data.termino?.uf)) throw new Error("Informe o município/UF de término.");
    if (!dig(data.motorista?.cpf) || !txt(data.motorista?.nome)) throw new Error("Informe nome e CPF do motorista.");
    if (!txt(data.veiculo?.placa)) throw new Error("Informe a placa do veículo.");
    if (!(Number(data.veiculo?.tara) > 0)) throw new Error("Informe a tara do veículo em kg.");
    if (!(Number(data.pesoTotalKg) > 0)) throw new Error("Informe o peso total da carga.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { bsoft, codigoAmbiente } = await import("@/lib/fiscal.server");
    const empresa = await empresaEmitente(context.supabase as never, data.empresaId ?? null);
    const ambiente = amb(data.ambiente);

    const { data: ctes } = await context.supabase
      .from("fiscal_documentos")
      .select("id, chave_acesso, status, valor, peso_kg, ambiente")
      .in("id", data.cteIds)
      .eq("tipo", "cte");
    const validos = (ctes ?? []).filter((c) => c.status === "autorizado" && c.chave_acesso);
    if (!validos.length) throw new Error("Nenhum dos CT-es selecionados está autorizado com chave de acesso.");
    if (validos.some((c) => amb(c.ambiente) !== ambiente)) {
      throw new Error(
        "Os CT-es selecionados foram emitidos em outro ambiente. Emita o manifesto no mesmo ambiente dos CT-es.",
      );
    }

    const ciot = txt(data.ciot, 40).replace(/\D+/g, "") || null;

    const { data: doc, error } = await context.supabase
      .from("fiscal_documentos")
      .insert({
        tipo: "mdfe",
        status: "rascunho",
        ambiente,
        empresa_id: empresa.id || null,
        valor: Number(data.valorTotal) || validos.reduce((s, c) => s + Number(c.valor ?? 0), 0),
        peso_kg: Number(data.pesoTotalKg),
        produto_predominante: txt(data.produtoPredominante, 120),
        ciot,
        viagem_id: data.viagemId ?? null,
        veiculo_id: data.veiculoId ?? null,
        motorista_id: data.motoristaId ?? null,
        observacoes: txt(data.observacao, 500) || null,
        created_by: context.userId,
      })
      .select("id, id_integracao")
      .single();
    if (error || !doc) throw new Error(error?.message ?? "Não foi possível registrar o MDF-e.");

    await context.supabase
      .from("fiscal_mdfe_ctes")
      .insert(validos.map((c) => ({ mdfe_id: doc.id, cte_id: c.id })));

    if (data.ciotId) {
      await context.supabase.from("fiscal_ciots").update({ mdfe_id: doc.id }).eq("id", data.ciotId);
    }


    const ufs = Array.from(
      new Set([...(data.ufsPercurso ?? []).map((u) => txt(u, 2).toUpperCase())].filter(Boolean)),
    );

    const payload = {
      idIntegracao: doc.id_integracao,
      empresa: { inscricaoFederal: empresa.inscricaoFederal, inscricaoEstadual: empresa.inscricaoEstadual },
      ufsPercurso: ufs,
      tipoTransportador: data.tipoTransportador ?? "ETC",
      inicio: { uf: txt(data.inicio.uf, 2).toUpperCase(), municipio: txt(data.inicio.municipio, 60) },
      termino: { uf: txt(data.termino.uf, 2).toUpperCase(), municipio: txt(data.termino.municipio, 60) },
      dadosGerais: {
        valorTotal: Number(data.valorTotal),
        pesoTotalKg: Number(data.pesoTotalKg),
        produtoPredominante: {
          tipoCarga: data.tipoCarga ?? "CARGA_GERAL",
          descricaoProduto: txt(data.produtoPredominante, 120),
        },
      },
      modal: {
        rodoviario: {
          rntrc: empresa.rntrc ?? undefined,
          ciots: ciot ? [{ ciot, inscricaoFederalContratante: empresa.inscricaoFederal }] : undefined,
          motoristas: [{ nome: txt(data.motorista.nome, 60), cpf: dig(data.motorista.cpf) }],

          veiculos: [
            {
              placa: txt(data.veiculo.placa, 7).toUpperCase().replace(/[^A-Z0-9]/g, ""),
              uf: txt(data.veiculo.uf, 2).toUpperCase() || undefined,
              renavam: dig(data.veiculo.renavam).slice(0, 11) || undefined,
              tara: Number(data.veiculo.tara),
              capacidadeKg: Number(data.veiculo.capacidadeKg ?? 0) || undefined,
              tipoVeiculo: "TRACAO",
              tipoCarroceria: data.veiculo.tipoCarroceria ?? "FECHADA_BAU",
              tipoRodado: data.veiculo.tipoRodado ?? "TRUCK",
              propriedadeVeiculo: data.veiculo.propriedadeVeiculo ?? "PROPRIO",
            },
          ],
        },
      },
      notas: validos.map((c) => ({
        chave: String(c.chave_acesso),
        tipoDocumento: "CTE",
        municipio: { uf: txt(data.termino.uf, 2).toUpperCase(), municipio: txt(data.termino.municipio, 60) },
      })),
      observacaoContribuinte: txt(data.observacao, 500) || undefined,
      ambiente: codigoAmbiente(ambiente),
    };

    try {
      const criado = await bsoft(context.supabase, "mdfe", "/v1/integracoes/mdfe", { method: "POST", body: payload, ambiente });
      const bsoftId = criado?.id;
      if (!bsoftId) throw new Error("A Bsoft não retornou o identificador do MDF-e criado.");

      const emissao = await bsoft(context.supabase, "mdfe", "/v1/integracoes/mdfes/emitir", {
        method: "POST",
        body: { idList: [bsoftId], enviarEmailParaEmitente: false },
        ambiente,
      });
      const transacao = emissao?.idTransacao ?? emissao?.id ?? null;

      await context.supabase
        .from("fiscal_documentos")
        .update({ bsoft_id: bsoftId, transacao_id: transacao, status: "processando", payload, motivo: null })
        .eq("id", doc.id);

      return { id: doc.id as string, bsoftId, transacaoId: transacao };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "Falha desconhecida";
      await context.supabase
        .from("fiscal_documentos")
        .update({ status: "rejeitado", motivo: motivo.slice(0, 2000), payload })
        .eq("id", doc.id);
      throw e;
    }
  });

/** Encerra o manifesto no município de destino. */
export const encerrarMdfe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; uf: string; municipio: string }) => {
    if (!data?.id) throw new Error("Documento não informado.");
    if (!txt(data.uf) || !txt(data.municipio)) throw new Error("Informe o município e a UF de encerramento.");
    return { id: String(data.id), uf: txt(data.uf, 2).toUpperCase(), municipio: txt(data.municipio, 60) };
  })
  .handler(async ({ data, context }) => {
    const { bsoft } = await import("@/lib/fiscal.server");
    const { data: doc } = await context.supabase
      .from("fiscal_documentos")
      .select("id, bsoft_id, tipo, ambiente")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc?.bsoft_id || doc.tipo !== "mdfe") throw new Error("MDF-e não encontrado ou ainda não emitido.");

    await bsoft(context.supabase, "mdfe", "/v1/integracoes/mdfes/encerrar", {
      method: "POST",
      body: {
        idMdfeList: [doc.bsoft_id],
        dataEncerramento: new Date().toISOString(),
        municipio: { uf: data.uf, municipio: data.municipio },
      },
      ambiente: amb(doc.ambiente),
    });

    await context.supabase.from("fiscal_documentos").update({ status: "encerrado" }).eq("id", doc.id);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Pré-validação: aponta os campos que faltam antes de emitir          */
/* ------------------------------------------------------------------ */

type Bloco = { rotulo: string; nome: string; faltando: string[] };

const falta = (cond: unknown, campo: string, lista: string[]) => {
  if (!cond) lista.push(campo);
};

function checarEmpresa(c: Record<string, unknown> | null, tipo: "cte" | "mdfe"): Bloco {
  const f: string[] = [];
  if (!c) return { rotulo: "Empresa emitente", nome: "—", faltando: ["cadastre e marque uma empresa emitente"] };
  falta(txt(c["razao_social"]), "razão social", f);
  falta(dig(c["cnpj"]).length >= 14, "CNPJ", f);
  falta(txt(c["inscricao_estadual"]), "inscrição estadual", f);
  falta(txt(c["endereco"]), "logradouro", f);
  falta(txt(c["endereco_numero"]), "número", f);
  falta(txt(c["bairro"]), "bairro", f);
  falta(txt(c["cidade"]), "cidade", f);
  falta(txt(c["uf"]), "UF", f);
  falta(dig(c["cep"]).length === 8, "CEP", f);
  falta(dig(c["telefone"]).length >= 10, "telefone", f);
  if (tipo === "mdfe") falta(txt(c["rntrc"]), "RNTRC", f);
  return {
    rotulo: "Empresa emitente",
    nome: txt(c["razao_social"] || c["nome_fantasia"], 80) || "—",
    faltando: f,
  };
}

function checarCliente(c: Record<string, unknown> | null): Bloco {
  const f: string[] = [];
  if (!c) return { rotulo: "Cliente", nome: "—", faltando: ["vincule um cliente à viagem"] };
  falta(txt(c["razao_social"]), "razão social", f);
  falta(dig(c["cnpj_cpf"]).length >= 11, "CNPJ/CPF", f);
  falta(txt(c["endereco"]), "logradouro", f);
  falta(txt(c["endereco_numero"]), "número", f);
  falta(txt(c["bairro"]), "bairro", f);
  falta(txt(c["cidade"]), "cidade", f);
  falta(txt(c["uf"]), "UF", f);
  falta(dig(c["cep"]).length === 8, "CEP", f);
  falta(dig(c["telefone"]).length >= 10, "telefone", f);
  return { rotulo: "Cliente", nome: txt(c["razao_social"], 80) || "—", faltando: f };
}

/** Confere empresa, cliente, viagem, veículo e motorista antes de enviar à SEFAZ. */
export const prevalidarEmissao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tipo: "cte" | "mdfe"; empresaId?: string | null; viagemId?: string | null; fechamentoId?: string | null }) => ({
    tipo: data?.tipo === "mdfe" ? ("mdfe" as const) : ("cte" as const),
    empresaId: data?.empresaId ? String(data.empresaId) : null,
    viagemId: data?.viagemId ? String(data.viagemId) : null,
    fechamentoId: data?.fechamentoId ? String(data.fechamentoId) : null,
  }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const blocos: Bloco[] = [];

    let qEmp = sb.from("company_settings").select("*");
    qEmp = data.empresaId
      ? qEmp.eq("id", data.empresaId)
      : qEmp.eq("emitente_fiscal", true).eq("ativo", true).order("emitente_padrao", { ascending: false });
    const { data: empresa } = await qEmp.order("created_at", { ascending: true }).limit(1).maybeSingle();
    blocos.push(checarEmpresa((empresa ?? null) as Record<string, unknown> | null, data.tipo));

    // Viagens envolvidas: a informada ou as do fechamento.
    let viagemIds: string[] = data.viagemId ? [data.viagemId] : [];
    if (!viagemIds.length && data.fechamentoId) {
      const { data: fv } = await sb.from("fechamento_viagens").select("viagem_id").eq("fechamento_id", data.fechamentoId);
      viagemIds = (fv ?? []).map((r) => String(r.viagem_id)).filter(Boolean);
    }

    if (viagemIds.length) {
      const { data: viagens } = await sb
        .from("viagens")
        .select(
          "id, codigo, status, cliente_id, veiculo_id, motorista_id, origem_cidade, origem_uf, destino_cidade, destino_uf, valor_frete, distancia_estimada_km",
        )
        .in("id", viagemIds.slice(0, 100));

      const clienteIds = Array.from(new Set((viagens ?? []).map((v) => v.cliente_id).filter(Boolean))) as string[];
      const { data: clientes } = clienteIds.length
        ? await sb.from("clientes").select("*").in("id", clienteIds)
        : { data: [] as Record<string, unknown>[] };

      const veiculoIds = Array.from(new Set((viagens ?? []).map((v) => v.veiculo_id).filter(Boolean))) as string[];
      const { data: veiculos } = veiculoIds.length
        ? await sb.from("veiculos").select("id, placa, renavam, capacidade_kg, tipo").in("id", veiculoIds)
        : { data: [] as Record<string, unknown>[] };

      const motoristaIds = Array.from(new Set((viagens ?? []).map((v) => v.motorista_id).filter(Boolean))) as string[];
      const { data: motoristas } = motoristaIds.length
        ? await sb.from("motoristas").select("id, nome, cpf, telefone").in("id", motoristaIds)
        : { data: [] as Record<string, unknown>[] };

      for (const v of viagens ?? []) {
        const f: string[] = [];
        falta(v.cliente_id, "cliente", f);
        falta(txt(v.origem_cidade) && txt(v.origem_uf), "cidade/UF de origem", f);
        falta(txt(v.destino_cidade) && txt(v.destino_uf), "cidade/UF de destino", f);
        falta(Number(v.valor_frete) > 0, "valor do frete", f);
        if (data.tipo === "mdfe") {
          falta(v.veiculo_id, "veículo", f);
          falta(v.motorista_id, "motorista", f);
        }
        blocos.push({ rotulo: `Viagem OS ${v.codigo ?? "—"}`, nome: `${v.origem_cidade ?? "?"} → ${v.destino_cidade ?? "?"}`, faltando: f });

        const cli = (clientes ?? []).find((c) => String((c as { id?: string }).id) === String(v.cliente_id)) ?? null;
        const bc = checarCliente(cli as Record<string, unknown> | null);
        if (!blocos.some((b) => b.rotulo === bc.rotulo && b.nome === bc.nome)) blocos.push(bc);

        if (data.tipo === "mdfe") {
          const ve = (veiculos ?? []).find((x) => String((x as { id?: string }).id) === String(v.veiculo_id)) as
            | Record<string, unknown>
            | undefined;
          if (ve) {
            const fv: string[] = [];
            falta(txt(ve["placa"]), "placa", fv);
            falta(dig(ve["renavam"]).length >= 9, "Renavam", fv);
            falta(Number(ve["capacidade_kg"]) > 0, "capacidade em kg", fv);
            blocos.push({ rotulo: "Veículo", nome: txt(ve["placa"], 10) || "—", faltando: fv });
          }
          const mo = (motoristas ?? []).find((x) => String((x as { id?: string }).id) === String(v.motorista_id)) as
            | Record<string, unknown>
            | undefined;
          if (mo) {
            const fm: string[] = [];
            falta(txt(mo["nome"]), "nome", fm);
            falta(dig(mo["cpf"]).length === 11, "CPF", fm);
            blocos.push({ rotulo: "Motorista", nome: txt(mo["nome"], 60) || "—", faltando: fm });
          }
        }
      }
    }

    const pendencias = blocos.filter((b) => b.faltando.length);
    return { ok: pendencias.length === 0, blocos, pendencias };
  });

/* ------------------------------------------------------------------ */
/* Download em lote de XML e PDF                                       */
/* ------------------------------------------------------------------ */

/** Gera XML e PDF de todos os documentos de uma viagem ou de um fechamento. */
export const baixarLoteFiscal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { viagemId?: string | null; fechamentoId?: string | null; tipo?: "cte" | "mdfe" | "todos" }) => {
    if (!data?.viagemId && !data?.fechamentoId) throw new Error("Escolha uma viagem ou um fechamento.");
    return {
      viagemId: data.viagemId ? String(data.viagemId) : null,
      fechamentoId: data.fechamentoId ? String(data.fechamentoId) : null,
      tipo: data.tipo === "cte" || data.tipo === "mdfe" ? data.tipo : ("todos" as const),
    };
  })
  .handler(async ({ data, context }) => {
    const { bsoft } = await import("@/lib/fiscal.server");
    const sb = context.supabase;

    let viagemIds: string[] = data.viagemId ? [data.viagemId] : [];
    if (data.fechamentoId) {
      const { data: fv } = await sb.from("fechamento_viagens").select("viagem_id").eq("fechamento_id", data.fechamentoId);
      viagemIds = Array.from(new Set([...viagemIds, ...(fv ?? []).map((r) => String(r.viagem_id))])).filter(Boolean);
    }

    let query = sb
      .from("fiscal_documentos")
      .select("id, tipo, numero, serie, chave_acesso, bsoft_id, status, ambiente, viagem_id, fechamento_id, viagem:viagens(codigo)")
      .in("status", ["autorizado", "encerrado"])
      .not("bsoft_id", "is", null)
      .limit(60);
    if (data.tipo !== "todos") query = query.eq("tipo", data.tipo);

    const filtros: string[] = [];
    if (viagemIds.length) filtros.push(`viagem_id.in.(${viagemIds.join(",")})`);
    if (data.fechamentoId) filtros.push(`fechamento_id.eq.${data.fechamentoId}`);
    if (filtros.length) query = query.or(filtros.join(","));

    const { data: docs, error } = await query;
    if (error) throw new Error(error.message);
    if (!docs?.length) return { arquivos: [] as Array<{ nome: string; pdf: string | null; xml: string | null; url: string | null }> };

    const b64 = (bytes: unknown) => {
      if (typeof bytes === "string" && bytes.length > 100) return bytes;
      if (Array.isArray(bytes) && bytes.length) return Buffer.from(Uint8Array.from(bytes as number[])).toString("base64");
      return null;
    };

    const arquivos: Array<{ nome: string; pdf: string | null; xml: string | null; url: string | null }> = [];
    for (const d of docs) {
      const os = (d as { viagem?: { codigo?: string | null } | null }).viagem?.codigo;
      const nome = [
        d.tipo === "cte" ? "CTe" : "MDFe",
        d.numero ? `n${d.numero}` : null,
        os ? `OS${os}` : null,
        d.chave_acesso ? String(d.chave_acesso).slice(-6) : String(d.id).slice(0, 6),
      ]
        .filter(Boolean)
        .join("-");
      try {
        if (d.tipo === "cte") {
          const r = await bsoft<Record<string, unknown>>("cte", "/v1/integracoes/ctes/imprimir-documento-cte", {
            method: "POST",
            body: { idCteList: [d.bsoft_id], ordenarPorIntegracao: true },
            ambiente: amb(d.ambiente),
          });
          arquivos.push({ nome, pdf: b64(r?.["bytesDacteCte"]), xml: b64(r?.["bytesXmlCte"]), url: (r?.["url"] as string) || null });
        } else {
          const r = await bsoft<Record<string, unknown>>("mdfe", "/v1/integracoes/mdfes/imprimir-documento-mdfe", {
            method: "POST",
            body: { idMdfeList: [d.bsoft_id], ordenarPorIntegracao: true },
            ambiente: amb(d.ambiente),
          });
          arquivos.push({ nome, pdf: b64(r?.["bytesDacteMdfe"]), xml: b64(r?.["bytesXmlMdfe"]), url: (r?.["url"] as string) || null });
        }
      } catch (e) {
        console.error("Falha ao baixar documento fiscal", d.id, e);
      }
    }
    return { arquivos };
  });

/**
 * Consulta a situação do documento na SEFAZ (via Bsoft) e devolve o resultado
 * detalhado, atualizando também o registro local.
 */
export const validarNaSefaz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string; chave?: string }) => {
    const id = txt(data?.id, 60);
    const chave = dig(data?.chave);
    if (!id && chave.length !== 44) throw new Error("Informe o documento ou uma chave de acesso com 44 dígitos.");
    return { id: id || null, chave: chave || null };
  })
  .handler(async ({ data, context }) => {
    const { bsoft } = await import("@/lib/fiscal.server");

    let q = context.supabase
      .from("fiscal_documentos")
      .select("id, tipo, status, numero, serie, chave_acesso, bsoft_id, transacao_id, ambiente, valor, created_at");
    q = data.id ? q.eq("id", data.id) : q.eq("chave_acesso", data.chave!);
    const { data: doc } = await q.limit(1).maybeSingle();
    if (!doc) throw new Error("Documento não encontrado neste sistema.");
    if (!doc.bsoft_id) throw new Error("Documento ainda não foi enviado para autorização.");

    const produto = doc.tipo === "cte" ? "cte" : "mdfe";
    const rota = produto === "cte" ? "/v1/integracoes/ctes" : "/v1/integracoes/mdfes";
    const ambiente = amb(doc.ambiente);

    let detalhe: Record<string, unknown> | null = null;
    let erroConsulta: string | null = null;
    try {
      detalhe = await bsoft<Record<string, unknown>>(produto, `${rota}/${doc.bsoft_id}`, { ambiente });
    } catch (e) {
      erroConsulta = e instanceof Error ? e.message : "Falha na consulta";
    }

    let itens: Array<Record<string, unknown>> = [];
    if (doc.transacao_id) {
      try {
        const res = await bsoft(context.supabase, produto, `${rota}/emitir/${doc.transacao_id}/obter-resultado`, { ambiente });
        itens = Array.isArray(res) ? (res as Array<Record<string, unknown>>) : [];
      } catch {
        itens = [];
      }
    }
    const item = itens[0] ?? {};

    const bruto = String(
      (detalhe?.["statusCte"] as string) ??
        (detalhe?.["statusMdfe"] as string) ??
        (detalhe?.["status"] as string) ??
        (item["statusOperacao"] as string) ??
        "",
    ).toUpperCase();

    let status: StatusDocumentoFiscal = doc.status as StatusDocumentoFiscal;
    if (bruto.includes("AUTORIZ")) status = "autorizado";
    else if (bruto.includes("CANCEL")) status = "cancelado";
    else if (bruto.includes("ENCERR")) status = "encerrado";
    else if (bruto.includes("REJEIT") || bruto.includes("DENEG") || item["sucesso"] === false) status = "rejeitado";
    else if (bruto.includes("PROCESS") || bruto.includes("TRANSMI")) status = "processando";

    const numero = (detalhe?.["numero"] ?? item["numero"] ?? doc.numero ?? null) as string | number | null;
    const serie = (detalhe?.["serie"] ?? item["serie"] ?? doc.serie ?? null) as string | number | null;
    const chave = (detalhe?.["chaveAcesso"] ?? detalhe?.["chave"] ?? doc.chave_acesso ?? null) as string | null;
    const protocolo = (detalhe?.["protocolo"] ??
      detalhe?.["numeroProtocolo"] ??
      item["protocolo"] ??
      null) as string | number | null;
    const dataAutorizacao = (detalhe?.["dataAutorizacao"] ??
      detalhe?.["dhRecebimento"] ??
      detalhe?.["dataEmissao"] ??
      null) as string | null;
    const codigoSefaz = (detalhe?.["codigoStatusSefaz"] ??
      detalhe?.["cStat"] ??
      item["codigo"] ??
      null) as string | number | null;
    const motivo = (item["motivo"] ??
      detalhe?.["motivo"] ??
      detalhe?.["mensagemSefaz"] ??
      detalhe?.["xMotivo"] ??
      erroConsulta ??
      null) as string | null;

    if (!erroConsulta || itens.length) {
      await context.supabase
        .from("fiscal_documentos")
        .update({
          status,
          numero: numero != null ? String(numero) : null,
          serie: serie != null ? String(serie) : null,
          chave_acesso: chave ? String(chave) : null,
          motivo: motivo ? String(motivo).slice(0, 2000) : null,
          resultado: JSON.parse(JSON.stringify({ detalhe, itens })),
        })
        .eq("id", doc.id);
    }

    return {
      id: doc.id as string,
      tipo: doc.tipo as string,
      ambiente,
      status,
      situacaoSefaz: bruto || null,
      numero: numero != null ? String(numero) : null,
      serie: serie != null ? String(serie) : null,
      chave: chave ? String(chave) : null,
      protocolo: protocolo != null ? String(protocolo) : null,
      codigoSefaz: codigoSefaz != null ? String(codigoSefaz) : null,
      dataAutorizacao,
      motivo: motivo ? String(motivo) : null,
      valor: Number(doc.valor ?? 0),
      consultaFalhou: !!erroConsulta,
    };
  });
