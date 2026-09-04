import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EntradaCte, EntradaMdfe, StatusDocumentoFiscal } from "@/lib/fiscal-tipos";

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
    const { credenciais } = await import("@/lib/fiscal.server");
    const { configurado } = credenciais();
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
    const { bsoft } = await import("@/lib/fiscal.server");
    const empresa = await empresaEmitente(context.supabase as never, data.empresaId ?? null);

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
      observacaoGeral: txt(data.observacao, 500) || undefined,
    };

    try {
      const criado = await bsoft<{ id?: string }>("cte", "/v1/integracoes/cte", { method: "POST", body: payload });
      const bsoftId = criado?.id;
      if (!bsoftId) throw new Error("A Bsoft não retornou o identificador do CT-e criado.");

      const emissao = await bsoft<{ id?: string; idTransacao?: string }>("cte", "/v1/integracoes/ctes/emitir", {
        method: "POST",
        body: { idList: [bsoftId], enviarEmail: !!data.enviarEmail, averbarCte: false },
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
      .select("id, tipo, bsoft_id, transacao_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("Documento não encontrado.");
    if (!doc.bsoft_id) throw new Error("Documento ainda não enviado à Bsoft.");

    const produto = doc.tipo === "cte" ? "cte" : "mdfe";
    const base = produto === "cte" ? "/v1/integracoes/ctes" : "/v1/integracoes/mdfes";

    // Resultado da transação assíncrona (quando existe).
    let itens: Array<Record<string, unknown>> = [];
    if (doc.transacao_id) {
      try {
        const res = await bsoft<unknown>(produto, `${base}/emitir/${doc.transacao_id}/obter-resultado`);
        itens = Array.isArray(res) ? (res as Array<Record<string, unknown>>) : [];
      } catch {
        itens = [];
      }
    }

    // Situação atual do documento.
    let detalhe: Record<string, unknown> | null = null;
    try {
      detalhe = await bsoft<Record<string, unknown>>(produto, `${base}/${doc.bsoft_id}`);
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
      .select("id, tipo, bsoft_id")
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
      });
      return { url: (r?.["url"] as string) || null, pdf: b64(r?.["bytesDacteCte"]), xml: b64(r?.["bytesXmlCte"]) };
    }

    const r = await bsoft<Record<string, unknown>>("mdfe", "/v1/integracoes/mdfes/imprimir-documento-mdfe", {
      method: "POST",
      body: { idMdfeList: [doc.bsoft_id], ordenarPorIntegracao: true },
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
      .select("id, tipo, bsoft_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc?.bsoft_id) throw new Error("Documento ainda não emitido na Bsoft.");

    const agora = new Date().toISOString();
    if (doc.tipo === "cte") {
      await bsoft("cte", "/v1/integracoes/cte/cancelar", {
        method: "POST",
        body: { idList: [doc.bsoft_id], motivoCancelamento: data.motivo, dataAtual: agora },
      });
    } else {
      await bsoft("mdfe", "/v1/integracoes/mdfes/cancelar", {
        method: "POST",
        body: { idMdfeList: [doc.bsoft_id], motivoCancelamento: data.motivo, dataCancelamento: agora },
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
    const { bsoft } = await import("@/lib/fiscal.server");
    const empresa = await empresaEmitente(context.supabase as never, data.empresaId ?? null);

    const { data: ctes } = await context.supabase
      .from("fiscal_documentos")
      .select("id, chave_acesso, status, valor, peso_kg")
      .in("id", data.cteIds)
      .eq("tipo", "cte");
    const validos = (ctes ?? []).filter((c) => c.status === "autorizado" && c.chave_acesso);
    if (!validos.length) throw new Error("Nenhum dos CT-es selecionados está autorizado com chave de acesso.");

    const ciot = txt(data.ciot, 40).replace(/\D+/g, "") || null;

    const { data: doc, error } = await context.supabase
      .from("fiscal_documentos")
      .insert({
        tipo: "mdfe",
        status: "rascunho",
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
    };

    try {
      const criado = await bsoft<{ id?: string }>("mdfe", "/v1/integracoes/mdfe", { method: "POST", body: payload });
      const bsoftId = criado?.id;
      if (!bsoftId) throw new Error("A Bsoft não retornou o identificador do MDF-e criado.");

      const emissao = await bsoft<{ id?: string; idTransacao?: string }>("mdfe", "/v1/integracoes/mdfes/emitir", {
        method: "POST",
        body: { idList: [bsoftId], enviarEmailParaEmitente: false },
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
      .select("id, bsoft_id, tipo")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc?.bsoft_id || doc.tipo !== "mdfe") throw new Error("MDF-e não encontrado ou ainda não emitido.");

    await bsoft("mdfe", "/v1/integracoes/mdfes/encerrar", {
      method: "POST",
      body: {
        idMdfeList: [doc.bsoft_id],
        dataEncerramento: new Date().toISOString(),
        municipio: { uf: data.uf, municipio: data.municipio },
      },
    });

    await context.supabase.from("fiscal_documentos").update({ status: "encerrado" }).eq("id", doc.id);
    return { ok: true };
  });
