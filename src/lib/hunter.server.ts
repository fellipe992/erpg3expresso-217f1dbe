/** Helpers server-only do módulo Hunter (prospecção B2B). */

export type EmpresaEncontrada = {
  place_id: string;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type DecisorEncontrado = {
  apollo_id: string | null;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  linkedin_url: string | null;
};

export const CARGOS_ALVO = [
  "Gerente de Logística",
  "Coordenador de Transportes",
  "Diretor de Operações",
  "Gerente de Supply Chain",
  "Comprador",
  "Gerente de Suprimentos",
];

const APOLLO_TITLES = [
  "gerente de logistica",
  "gerente de logística",
  "logistics manager",
  "coordenador de transportes",
  "coordenador de transporte",
  "transportation coordinator",
  "diretor de operacoes",
  "diretor de operações",
  "operations director",
  "gerente de supply chain",
  "supply chain manager",
  "comprador",
  "purchasing",
  "gerente de suprimentos",
  "procurement manager",
];

// A busca de empresas no Google Places é feita no navegador
// (src/lib/hunter-places-browser.ts), pois a chave do Google é restrita por referer.


/** Extrai o domínio a partir de uma URL de site. */
export function extrairDominio(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith("http") ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type ResultadoDecisores = { decisores: DecisorEncontrado[]; aviso: string | null };

/** Busca decisores no Apollo.io filtrando pelos cargos-alvo de logística/compras. */
export async function buscarDecisoresApollo(dominio: string): Promise<ResultadoDecisores> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const apolloKey = process.env.APOLLO_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurada.");
  if (!apolloKey) throw new Error("Integração Apollo.io não conectada (APOLLO_API_KEY ausente).");

  const url = new URL("https://connector-gateway.lovable.dev/apollo/api/v1/mixed_people/search");
  const params = new URLSearchParams();
  params.set("q_organization_domains_list[]", dominio);
  for (const t of APOLLO_TITLES) params.append("person_titles[]", t);
  params.set("per_page", "25");
  params.set("page", "1");
  url.search = params.toString();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apolloKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[hunter] Apollo falhou [${res.status}]: ${body}`);

    if (res.status === 403 && body.includes("API_INACCESSIBLE")) {
      return {
        decisores: [],
        aviso:
          "A busca automática de decisores não está disponível: o plano gratuito do Apollo.io não libera o endpoint de busca de pessoas. " +
          "Para ativar, contrate um plano pago do Apollo (ou use uma chave master) em Configurações → Integrações → API. " +
          "Enquanto isso, cadastre o contato manualmente pelo botão abaixo.",
      };
    }
    if (res.status === 401) {
      return {
        decisores: [],
        aviso: "A chave do Apollo.io é inválida ou foi revogada. Reconecte a integração para voltar a buscar decisores.",
      };
    }
    if (res.status === 429) {
      return {
        decisores: [],
        aviso: "Limite de requisições do Apollo.io atingido. Aguarde alguns minutos e tente novamente.",
      };
    }
    throw new Error(`Busca de decisores falhou [${res.status}]: ${body}`);
  }

  const json = (await res.json()) as {
    people?: {
      id?: string;
      name?: string;
      first_name?: string;
      last_name?: string;
      title?: string;
      email?: string;
      linkedin_url?: string;
      phone_numbers?: { sanitized_number?: string; raw_number?: string }[];
      organization?: { phone?: string };
    }[];
    contacts?: unknown[];
  };

  return (json.people ?? [])
    .map((p) => ({
      apollo_id: p.id ?? null,
      nome: p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" "),
      cargo: p.title ?? null,
      email: p.email && !p.email.includes("email_not_unlocked") ? p.email : null,
      telefone:
        p.phone_numbers?.[0]?.sanitized_number ??
        p.phone_numbers?.[0]?.raw_number ??
        p.organization?.phone ??
        null,
      linkedin_url: p.linkedin_url ?? null,
    }))
    .filter((p) => p.nome);
}
