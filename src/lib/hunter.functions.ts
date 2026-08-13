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
    const { buscarDecisoresApollo, extrairDominio } = await import("@/lib/hunter.server");
    const { buscarPerfisLinkedIn, raspagemSite, consolidarComIa, mesclarDecisores, linkedinStatus } = await import(
      "@/lib/hunter-sources.server"
    );

    const { data: empresa, error } = await context.supabase
      .from("companies")
      .select("id, nome, website")
      .eq("id", data.companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!empresa) throw new Error("Empresa não encontrada.");

    const dominio = extrairDominio(empresa.website as string | null);
    const nomeEmpresa = empresa.nome as string;

    // Fontes em paralelo — cada uma degrada de forma isolada.
    const [apollo, linkedin, site, li] = await Promise.all([
      dominio
        ? buscarDecisoresApollo(dominio).catch((e: Error) => ({ decisores: [], aviso: e.message }))
        : Promise.resolve({ decisores: [], aviso: null as string | null }),
      buscarPerfisLinkedIn(nomeEmpresa, dominio),
      dominio ? raspagemSite(dominio) : Promise.resolve(null),
      linkedinStatus(),
    ]);

    const ia = await consolidarComIa({ empresa: nomeEmpresa, dominio, linkedin, site });

    const decisores = mesclarDecisores([
      apollo.decisores.map((d) => ({ ...d, fonte: "apollo" as const, confianca: "alta" as const })),
      linkedin,
      ia.decisores,
    ]);

    // Persiste o enriquecimento da empresa (resumo e canais gerais).
    if (site || ia.resumoEmpresa) {
      await context.supabase
        .from("companies")
        .update({
          resumo: ia.resumoEmpresa ?? site?.resumo ?? null,
          emails_gerais: site?.emails ?? null,
          telefones_gerais: site?.telefones ?? null,
        })
        .eq("id", empresa.id as string);
    }

    const fontes = {
      apollo: apollo.decisores.length > 0,
      linkedin: linkedin.length > 0,
      site: !!site,
      ia: ia.decisores.length > 0,
      linkedinConectado: li.conectado,
    };

    const aviso =
      decisores.length === 0
        ? dominio
          ? "Nenhum decisor identificado nas fontes públicas (LinkedIn, site da empresa e Apollo). Cadastre o contato manualmente abaixo."
          : "Esta empresa não possui site cadastrado no Google — a busca ficou limitada. Cadastre o contato manualmente abaixo."
        : (apollo.aviso ?? null);

    return {
      dominio,
      decisores,
      aviso,
      fontes,
      empresaResumo: ia.resumoEmpresa ?? site?.resumo ?? null,
      emailsGerais: site?.emails ?? [],
      telefonesGerais: site?.telefones ?? [],
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
      created_by: context.userId,
    });
    if (errContato) throw new Error(errContato.message);

    return { ok: true, leadId: lead.id as string };
  });
