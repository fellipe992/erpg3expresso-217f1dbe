import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const buscarEmpresas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { cidade: string; raioKm: number; keyword: string }) => {
    const cidade = (data?.cidade ?? "").trim();
    const keyword = (data?.keyword ?? "").trim();
    if (cidade.length < 2) throw new Error("Informe a cidade ou região.");
    const raioKm = Number(data?.raioKm) || 25;
    // Sem palavra-chave, busca os perfis padrão de embarcador/distribuidor.
    return { cidade, keyword: keyword.length >= 2 ? keyword : "distribuidora atacadista indústria", raioKm };
  })
  .handler(async ({ data, context }) => {
    const { buscarEmpresasPlaces } = await import("@/lib/hunter.server");
    const encontradas = await buscarEmpresasPlaces(data);
    if (encontradas.length === 0) return { empresas: [] };


    const rows = encontradas.map((e) => ({
      ...e,
      cidade: data.cidade,
      segmento: data.keyword,
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
    const { data: empresa, error } = await context.supabase
      .from("companies")
      .select("id, nome, website")
      .eq("id", data.companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!empresa) throw new Error("Empresa não encontrada.");

    const dominio = extrairDominio(empresa.website as string | null);
    if (!dominio) {
      return { dominio: null, decisores: [], aviso: "Esta empresa não possui site cadastrado no Google." };
    }

    const decisores = await buscarDecisoresApollo(dominio);
    return { dominio, decisores, aviso: null as string | null };
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
