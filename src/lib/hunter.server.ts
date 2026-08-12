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

function googleKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY não configurada no backend.");
  return key;
}

/** Geocodifica a cidade/região informada para centrar a busca. */
async function geocodar(cidade: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", cidade);
  url.searchParams.set("language", "pt-BR");
  url.searchParams.set("region", "br");
  url.searchParams.set("key", googleKey());
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao localizar a região (${res.status}).`);
  const json = (await res.json()) as {
    status: string;
    results?: { geometry?: { location?: { lat: number; lng: number } } }[];
  };
  const loc = json.results?.[0]?.geometry?.location;
  return loc ? { lat: loc.lat, lng: loc.lng } : null;
}

/** Busca empresas via Google Places API (Text Search v1). */
export async function buscarEmpresasPlaces(input: {
  cidade: string;
  raioKm: number;
  keyword: string;
}): Promise<EmpresaEncontrada[]> {
  const centro = await geocodar(input.cidade);
  if (!centro) throw new Error("Não foi possível localizar a cidade/região informada.");

  const raio = Math.min(Math.max(input.raioKm || 25, 1), 50) * 1000;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.location",
    },
    body: JSON.stringify({
      textQuery: `${input.keyword} em ${input.cidade}`,
      languageCode: "pt-BR",
      regionCode: "BR",
      maxResultCount: 20,
      locationBias: { circle: { center: { latitude: centro.lat, longitude: centro.lng }, radius: raio } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[hunter] Places falhou [${res.status}]: ${body}`);
    throw new Error(`Busca no Google Places falhou [${res.status}]: ${body}`);
  }

  const json = (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      internationalPhoneNumber?: string;
      websiteUri?: string;
      location?: { latitude?: number; longitude?: number };
    }[];
  };

  return (json.places ?? [])
    .filter((p) => p.id && p.displayName?.text)
    .map((p) => ({
      place_id: p.id,
      nome: p.displayName!.text!,
      endereco: p.formattedAddress ?? null,
      telefone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
    }));
}

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

/** Busca decisores no Apollo.io filtrando pelos cargos-alvo de logística/compras. */
export async function buscarDecisoresApollo(dominio: string): Promise<DecisorEncontrado[]> {
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
