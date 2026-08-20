import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EmpresaEntrada = {
  place_id: string;
  nome: string;
  endereco?: string | null;
  telefone?: string | null;
  website?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/**
 * Persiste as empresas encontradas no navegador (Maps JS API).
 * A busca é feita no cliente porque a chave do Google é restrita por referer.
 */
export const salvarEmpresas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { cidade: string; segmento: string; empresas: EmpresaEntrada[] }) => {
    const cidade = (data?.cidade ?? "").trim();
    if (cidade.length < 2) throw new Error("Informe a cidade ou região.");
    const segmento = (data?.segmento ?? "").trim().slice(0, 120);
    const empresas = (Array.isArray(data?.empresas) ? data.empresas : [])
      .filter((e) => e?.place_id && e?.nome)
      .slice(0, 40)
      .map((e) => ({
        place_id: String(e.place_id).slice(0, 200),
        nome: String(e.nome).slice(0, 200),
        endereco: e.endereco ? String(e.endereco).slice(0, 300) : null,
        telefone: e.telefone ? String(e.telefone).slice(0, 60) : null,
        website: e.website ? String(e.website).slice(0, 300) : null,
        latitude: typeof e.latitude === "number" ? e.latitude : null,
        longitude: typeof e.longitude === "number" ? e.longitude : null,
      }));
    return { cidade, segmento, empresas };
  })
  .handler(async ({ data, context }) => {
    if (data.empresas.length === 0) return { empresas: [] };

    const rows = data.empresas.map((e) => ({
      ...e,
      cidade: data.cidade,
      segmento: data.segmento || null,
      created_by: context.userId,
    }));

    const { data: salvas, error } = await context.supabase
      .from("companies")
      .upsert(rows, { onConflict: "place_id" })
      .select("*");
    if (error) throw new Error(error.message);
    return { empresas: salvas ?? [] };
  });


export const buscarDecisores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string }) => {
    if (!data?.companyId) throw new Error("Empresa inválida.");
    return { companyId: data.companyId };
  })
  .handler(async ({ data, context }) => {
    const { extrairDominio } = await import("@/lib/hunter.server");
    const {
      buscarPerfisLinkedIn,
      enriquecerPerfisLinkedIn,
      raspagemSite,
      consolidarComIa,
      mesclarDecisores,
      linkedinStatus,
    } = await import("@/lib/hunter-sources.server");

    const { data: empresa, error } = await context.supabase
      .from("companies")
      .select("id, nome, website, telefone")
      .eq("id", data.companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!empresa) throw new Error("Empresa não encontrada.");

    const dominio = extrairDominio(empresa.website as string | null);
    const nomeEmpresa = empresa.nome as string;

    // Fontes gratuitas em paralelo — cada uma degrada de forma isolada.
    const [perfis, site, li] = await Promise.all([
      buscarPerfisLinkedIn(nomeEmpresa, dominio),
      dominio ? raspagemSite(dominio) : Promise.resolve(null),
      linkedinStatus(),
    ]);

    const linkedin = await enriquecerPerfisLinkedIn(perfis);
    const ia = await consolidarComIa({ empresa: nomeEmpresa, dominio, linkedin, site });

    const mesclados = mesclarDecisores([linkedin, ia.decisores]);

    const { verificarEmail } = await import("@/lib/email-verify.server");

    // NUNCA deduzimos endereços: só entram e-mails realmente publicados nas
    // fontes (site da empresa / perfil público). Quem não tem e-mail real
    // aparece sem e-mail, para contato por LinkedIn ou WhatsApp da empresa.
    const decisores = await Promise.all(
      mesclados.map(async (d) => {
        if (!d.email) return { ...d, email: null, email_status: undefined, email_motivo: null };
        const v = await verificarEmail(d.email, "fonte");
        if (v.status === "invalido") {
          return {
            ...d,
            email: null,
            email_status: "invalido" as const,
            email_motivo: v.motivo,
            confianca: "baixa" as const,
          };
        }
        return { ...d, email: v.email, email_status: v.status, email_motivo: v.motivo };
      }),
    );

    // E-mails institucionais do site: verificados um a um antes de exibir.
    const emailsVerificados = (
      await Promise.all(
        (site?.emails ?? []).map(async (e) => {
          const v = await verificarEmail(e, "fonte");
          return v.status === "invalido" ? null : { email: v.email, motivo: v.motivo };
        }),
      )
    ).filter(Boolean) as { email: string; motivo: string }[];

    // Telefones da empresa (site + Google) prontos para WhatsApp.
    const telefones = Array.from(
      new Set([...(site?.telefones ?? []), (empresa.telefone as string | null) ?? ""].filter(Boolean)),
    ) as string[];

    // Persiste o enriquecimento da empresa (resumo e canais gerais).
    if (site || ia.resumoEmpresa) {
      await context.supabase
        .from("companies")
        .update({
          resumo: ia.resumoEmpresa ?? site?.resumo ?? null,
          emails_gerais: emailsVerificados.map((e) => e.email),
          telefones_gerais: telefones,
        })
        .eq("id", empresa.id as string);
    }

    const fontes = {
      apollo: false,
      linkedin: linkedin.length > 0,
      site: !!site,
      ia: ia.decisores.length > 0,
      linkedinConectado: li.conectado,
    };

    const aviso =
      decisores.length === 0 && emailsVerificados.length === 0
        ? dominio
          ? "Nenhum e-mail ou decisor publicado nas fontes públicas (LinkedIn e site da empresa). Use o WhatsApp da empresa ou cadastre o contato manualmente."
          : "Esta empresa não possui site cadastrado no Google — a busca ficou limitada. Use o WhatsApp da empresa ou cadastre o contato manualmente."
        : null;

    return {
      dominio,
      decisores,
      aviso,
      fontes,
      empresaResumo: ia.resumoEmpresa ?? site?.resumo ?? null,
      emailsGerais: emailsVerificados,
      telefonesGerais: telefones,
      paginasAnalisadas: site?.paginas ?? [],
    };
  });


export const adicionarContatoCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      companyId: string;
      nome: string;
      cargo?: string | null;
      email?: string | null;
      telefone?: string | null;
      linkedin_url?: string | null;
      apollo_id?: string | null;
      fonte?: string | null;
      observacoes?: string | null;
    }) => {
      if (!data?.companyId) throw new Error("Empresa inválida.");
      if (!data?.nome?.trim()) throw new Error("Contato sem nome.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: empresa, error: errEmpresa } = await context.supabase
      .from("companies")
      .select("id, nome, cidade, endereco, telefone, website, segmento")
      .eq("id", data.companyId)
      .maybeSingle();
    if (errEmpresa) throw new Error(errEmpresa.message);
    if (!empresa) throw new Error("Empresa não encontrada.");

    // 1) Lead frio no CRM
    const { data: lead, error: errLead } = await context.supabase
      .from("crm_leads")
      .insert({
        empresa: empresa.nome as string,
        contato_nome: data.nome,
        cargo: data.cargo ?? null,
        email: data.email ?? null,
        telefone: data.telefone ?? (empresa.telefone as string | null),
        cidade: (empresa.cidade as string | null) ?? null,
        segmento: (empresa.segmento as string | null) ?? null,
        origem: "Prospecção ativa",
        classificacao: "C",
        prioridade: "baixa",
        status: "aberto",
        etiquetas: ["Hunter"],
        observacoes: [empresa.endereco, empresa.website, data.linkedin_url]
          .filter(Boolean)
          .join(" · ") || null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (errLead) throw new Error(errLead.message);

    // 2) Oportunidade na primeira etapa do funil
    const { data: etapa } = await context.supabase
      .from("crm_etapas")
      .select("id")
      .eq("ativo", true)
      .order("ordem")
      .limit(1)
      .maybeSingle();

    if (etapa?.id) {
      const { error: errOp } = await context.supabase.from("crm_oportunidades").insert({
        titulo: `${empresa.nome} — prospecção`,
        lead_id: lead.id,
        contato_nome: data.nome,
        contato_email: data.email ?? null,
        contato_telefone: data.telefone ?? null,
        valor_estimado: 0,
        probabilidade: 10,
        origem: "Prospecção ativa",
        etapa_id: etapa.id,
        descricao: data.cargo ? `Contato: ${data.cargo}` : null,
        created_by: context.userId,
      });
      if (errOp) throw new Error(errOp.message);
    }

    // 3) Contato vinculado à empresa
    const { error: errContato } = await context.supabase.from("contacts").insert({
      company_id: empresa.id as string,
      lead_id: lead.id,
      nome: data.nome,
      cargo: data.cargo ?? null,
      email: data.email ?? null,
      telefone: data.telefone ?? null,
      linkedin_url: data.linkedin_url ?? null,
      apollo_id: data.apollo_id ?? null,
      fonte: data.fonte ?? "manual",
      observacoes: data.observacoes ?? null,
      created_by: context.userId,
    });
    if (errContato) throw new Error(errContato.message);

    return { ok: true, leadId: lead.id as string };
  });


/**
 * Envia o e-mail de apresentação da G3 para um decisor específico (1 clique = 1 destinatário),
 * registra o primeiro contato no funil (lead + atividade) e grava o histórico de envios.
 */
export const enviarApresentacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      companyId: string;
      nome?: string | null;
      cargo?: string | null;
      email: string;
      telefone?: string | null;
      linkedin_url?: string | null;
    }) => {
      if (!data?.companyId) throw new Error("Empresa inválida.");
      const email = (data?.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("E-mail do contato inválido.");
      return { ...data, email };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: empresa, error: errEmpresa } = await context.supabase
      .from("companies")
      .select("id, nome, cidade, segmento, telefone, website, endereco")
      .eq("id", data.companyId)
      .maybeSingle();
    if (errEmpresa) throw new Error(errEmpresa.message);
    if (!empresa) throw new Error("Empresa não encontrada.");

    const { verificarEmail } = await import("@/lib/email-verify.server");
    const check = await verificarEmail(data.email, "fonte");
    if (check.status === "invalido") {
      throw new Error(`E-mail não entregável: ${check.motivo}`);
    }

    const nomeEmpresa = empresa.nome as string;
    const primeiroNome = (data.nome ?? "").trim().split(/\s+/)[0] ?? "";

    // 1) Lead no funil — reaproveita se o e-mail já existir.
    const { data: existente } = await context.supabase
      .from("crm_leads")
      .select("id")
      .eq("email", data.email)
      .limit(1)
      .maybeSingle();

    let leadId = existente?.id as string | undefined;
    if (!leadId) {
      const { data: lead, error: errLead } = await context.supabase
        .from("crm_leads")
        .insert({
          empresa: nomeEmpresa,
          contato_nome: data.nome ?? null,
          cargo: data.cargo ?? null,
          email: data.email,
          telefone: data.telefone ?? (empresa.telefone as string | null),
          cidade: (empresa.cidade as string | null) ?? null,
          segmento: (empresa.segmento as string | null) ?? null,
          origem: "Prospecção ativa",
          classificacao: "C",
          prioridade: "baixa",
          status: "aberto",
          etiquetas: ["Hunter", "E-mail enviado"],
          observacoes: [empresa.endereco, empresa.website, data.linkedin_url].filter(Boolean).join(" · ") || null,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (errLead) throw new Error(errLead.message);
      leadId = lead.id as string;
    }

    // 2-4) Envio + histórico + timeline do CRM.
    const { enviarApresentacaoRegistrando } = await import("@/lib/hunter-email.server");
    const { status, detalhe } = await enviarApresentacaoRegistrando({
      supabase: context.supabase as never,
      userId: context.userId,
      leadId,
      email: data.email,
      nome: data.nome ?? null,
      empresa: nomeEmpresa,
      companyId: empresa.id as string,
    });

    return { status, detalhe, leadId };
  });

/**
 * Disparo em lote do mesmo texto de apresentação, um e-mail por lead,
 * ignorando quem já recebeu (sem repetição).
 */
export const enviarLoteApresentacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadIds: string[] }) => {
    const leadIds = (Array.isArray(data?.leadIds) ? data.leadIds : []).filter(Boolean).slice(0, 50);
    if (leadIds.length === 0) throw new Error("Selecione ao menos um lead.");
    return { leadIds };
  })
  .handler(async ({ data, context }) => {
    const { enviarApresentacaoRegistrando } = await import("@/lib/hunter-email.server");

    const { data: leads, error } = await context.supabase
      .from("crm_leads")
      .select("id, empresa, contato_nome, email")
      .in("id", data.leadIds);
    if (error) throw new Error(error.message);

    const emails = (leads ?? []).map((l) => l.email).filter(Boolean) as string[];
    const { data: jaEnviados } = await context.supabase
      .from("crm_emails_enviados")
      .select("destinatario")
      .eq("template", "apresentacao-g3")
      .eq("status", "enviado")
      .in("destinatario", emails.length > 0 ? emails : ["-"]);
    const bloqueados = new Set((jaEnviados ?? []).map((r) => (r.destinatario as string).toLowerCase()));

    const { verificarEmail } = await import("@/lib/email-verify.server");

    let enviados = 0;
    let ignorados = 0;
    let falhas = 0;
    let invalidos = 0;

    for (const lead of leads ?? []) {
      const email = (lead.email ?? "").trim().toLowerCase();
      if (!email || bloqueados.has(email)) {
        ignorados++;
        continue;
      }
      bloqueados.add(email);
      const check = await verificarEmail(email, "fonte");
      if (check.status === "invalido") {
        invalidos++;
        continue;
      }
      const { status } = await enviarApresentacaoRegistrando({
        supabase: context.supabase as never,
        userId: context.userId,
        leadId: lead.id as string,
        email,
        nome: lead.contato_nome as string | null,
        empresa: lead.empresa as string,
      });
      if (status === "enviado") enviados++;
      else falhas++;
    }

    return { enviados, ignorados, falhas, invalidos };
  });

