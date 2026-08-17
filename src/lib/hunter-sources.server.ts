/**
 * Fontes gratuitas de enriquecimento de decisores (server-only).
 *
 * 1) Firecrawl Search  -> perfis públicos do LinkedIn relacionados à empresa
 * 2) Firecrawl Scrape  -> site da empresa (contato / quem somos) => e-mails, telefones, nomes
 * 3) Lovable AI        -> consolida, deduplica e classifica os cargos-alvo
 * 4) LinkedIn conector -> valida a identidade da conta conectada (escopo openid/profile)
 */

export type FonteDecisor = "apollo" | "linkedin" | "site" | "ia" | "manual";

export type DecisorRico = {
  apollo_id: string | null;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  linkedin_url: string | null;
  fonte: FonteDecisor;
  confianca: "alta" | "media" | "baixa";
  resumo?: string | null;
};

const GATEWAY = "https://connector-gateway.lovable.dev";
const FIRECRAWL_V2 = `${GATEWAY}/firecrawl/v2`;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const CARGOS_QUERY =
  '("gerente de logística" OR "coordenador de transportes" OR "diretor de operações" OR "supply chain" OR "suprimentos" OR "compras")';

function firecrawlHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!lovableKey || !fcKey) return null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": fcKey,
  } as Record<string, string>;
}

/** Espaça as chamadas ao Firecrawl (plano gratuito: ~10 req/min) e evita travar a requisição. */
let ultimaChamada = 0;
async function aguardarVez() {
  const espera = Math.max(0, 900 - (Date.now() - ultimaChamada));
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaChamada = Date.now();
}

async function firecrawl<T>(path: string, body: unknown, tentativas = 2): Promise<T | null> {
  const headers = firecrawlHeaders();
  if (!headers) return null;
  for (let i = 0; i < tentativas; i++) {
    await aguardarVez();
    try {
      const res = await fetch(`${FIRECRAWL_V2}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      if (res.ok) return (await res.json()) as T;
      const texto = await res.text();
      const recuperavel = res.status === 429 || res.status >= 500;
      console.error(`[hunter] Firecrawl ${path} falhou [${res.status}]: ${texto}`);
      if (!recuperavel || i === tentativas - 1) return null;
    } catch (e) {
      console.error(`[hunter] Firecrawl ${path} erro:`, e);
      if (i === tentativas - 1) return null;
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  return null;
}



type SearchResult = { url?: string; title?: string; description?: string; markdown?: string };

type SearchPayload = {
  data?: SearchResult[] | { web?: SearchResult[]; news?: SearchResult[]; images?: SearchResult[] };
  results?: SearchResult[];
  web?: SearchResult[];
};

/** O Firecrawl v2 pode devolver `data` como array ou como objeto por canal (web/news). */
function normalizarBusca(json: SearchPayload | null): SearchResult[] {
  if (!json || typeof json !== "object") return [];
  const arr = (v: unknown): SearchResult[] => (Array.isArray(v) ? (v as SearchResult[]) : []);
  const d = json.data as unknown;
  if (Array.isArray(d)) return d as SearchResult[];
  if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    const canais = [...arr(o.web), ...arr(o.news), ...arr(o.results)];
    if (canais.length > 0) return canais;
  }
  return [...arr(json.results), ...arr(json.web)];
}


/** Busca perfis públicos do LinkedIn ligados à empresa (via web search do Firecrawl). */
export async function buscarPerfisLinkedIn(empresa: string, dominio: string | null): Promise<DecisorRico[]> {
  const alvo = dominio ? `"${empresa}" OR "${dominio}"` : `"${empresa}"`;
  const json = await firecrawl<SearchPayload>("/search", {
    query: `site:linkedin.com/in ${alvo} ${CARGOS_QUERY}`,
    limit: 10,
  });
  const itens = normalizarBusca(json);


  return itens
    .filter((r) => (r.url ?? "").includes("linkedin.com/in"))
    .map((r) => {
      // Títulos do LinkedIn: "Nome - Cargo - Empresa | LinkedIn"
      const bruto = (r.title ?? "").replace(/\s*\|\s*LinkedIn.*$/i, "").trim();
      const partes = bruto.split(/\s+[-–—]\s+/);
      const nome = (partes[0] ?? "").trim();
      const cargo = partes.slice(1).join(" - ").trim() || null;
      return {
        apollo_id: null,
        nome,
        cargo,
        email: null,
        telefone: null,
        linkedin_url: (r.url ?? "").split("?")[0] ?? null,
        fonte: "linkedin" as const,
        confianca: "media" as const,
        resumo: r.description ?? null,
      };
    })
    .filter((d) => d.nome.length > 2 && d.nome.split(" ").length >= 2);
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TEL_RE = /(?:\+?55\s?)?\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4}/g;

export type DadosSite = {
  emails: string[];
  telefones: string[];
  resumo: string | null;
  paginas: string[];
  markdown: string;
};

/** Raspa o site da empresa (home + páginas de contato) e extrai canais diretos. */
export async function raspagemSite(dominio: string): Promise<DadosSite | null> {
  const base = `https://${dominio}`;
  const home = await firecrawl<{
    markdown?: string;
    summary?: string;
    links?: string[];
    data?: { markdown?: string; summary?: string; links?: string[] };
  }>("/scrape", {
    url: base,
    formats: ["markdown", "links", "summary"],
    onlyMainContent: false,
  });
  if (!home) return null;

  const doc = home.data ?? home;
  const paginas: string[] = [];
  const candidatas = (Array.isArray(doc.links) ? doc.links : [])
    .filter((l) => /contato|contact|quem-somos|sobre|equipe|team|institucional|fale/i.test(l))
    .filter((l) => l.includes(dominio))
    .slice(0, 3);

  let markdown = doc.markdown ?? "";
  for (const url of candidatas) {
    const extra = await firecrawl<{ markdown?: string; data?: { markdown?: string } }>("/scrape", {
      url,
      formats: ["markdown"],
      onlyMainContent: false,
    });
    const md = extra?.data?.markdown ?? extra?.markdown;
    if (md) {
      paginas.push(url);
      markdown += `\n\n--- ${url} ---\n${md}`;
    }
  }

  const emails = Array.from(new Set((markdown.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase())))
    .filter((e) => !/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(e))
    .filter((e) => !/(example|sentry|wixpress|godaddy|no-?reply)/i.test(e))
    .slice(0, 12);
  const telefones = Array.from(
    new Set(
      (markdown.match(TEL_RE) ?? [])
        .map((t) => t.replace(/\D/g, ""))
        // 10 ou 11 dígitos (DDD + número) ou com o 55 na frente
        .map((d) => (d.length > 11 && d.startsWith("55") ? d.slice(2) : d))
        .filter((d) => d.length === 10 || d.length === 11)
        // DDD brasileiro válido e número que não começa em 0/1
        .filter((d) => Number(d.slice(0, 2)) >= 11 && !/^[01]/.test(d.slice(2)))
        .map((d) =>
          d.length === 11
            ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
            : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`,
        ),
    ),
  ).slice(0, 8);


  return {
    emails,
    telefones,
    resumo: doc.summary ?? null,
    paginas,
    markdown: markdown.slice(0, 24000),
  };
}

type IaSaida = {
  decisores?: {
    nome?: string;
    cargo?: string;
    email?: string;
    telefone?: string;
    linkedin_url?: string;
    confianca?: string;
  }[];
  resumo_empresa?: string;
  canais_gerais?: { email?: string; telefone?: string }[];
};

/** Usa a IA (gateway Lovable) para consolidar as fontes em uma lista limpa de decisores. */
export async function consolidarComIa(params: {
  empresa: string;
  dominio: string | null;
  linkedin: DecisorRico[];
  site: DadosSite | null;
}): Promise<{ decisores: DecisorRico[]; resumoEmpresa: string | null }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { decisores: [], resumoEmpresa: null };

  const contexto = [
    `EMPRESA: ${params.empresa}`,
    params.dominio ? `DOMÍNIO: ${params.dominio}` : "",
    params.linkedin.length
      ? `PERFIS LINKEDIN ENCONTRADOS:\n${params.linkedin
          .map((d) => `- ${d.nome} | ${d.cargo ?? "?"} | ${d.linkedin_url ?? ""} | ${d.resumo ?? ""}`)
          .join("\n")}`
      : "",
    params.site
      ? `SITE — e-mails: ${params.site.emails.join(", ") || "nenhum"}; telefones: ${
          params.site.telefones.join(", ") || "nenhum"
        }\nCONTEÚDO:\n${params.site.markdown.slice(0, 12000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const res = await fetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é analista de prospecção B2B de transporte rodoviário de cargas. A partir das fontes públicas fornecidas, " +
              "identifique decisores de logística, transportes, operações, supply chain, suprimentos ou compras. " +
              "Nunca invente e-mails ou telefones: use apenas os que aparecem nas fontes. " +
              "Responda SOMENTE JSON no formato {\"resumo_empresa\":string,\"decisores\":[{\"nome\":string,\"cargo\":string,\"email\":string|null,\"telefone\":string|null,\"linkedin_url\":string|null,\"confianca\":\"alta\"|\"media\"|\"baixa\"}],\"canais_gerais\":[{\"email\":string|null,\"telefone\":string|null}]}",
          },
          { role: "user", content: contexto },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error(`[hunter] IA falhou [${res.status}]: ${await res.text()}`);
      return { decisores: [], resumoEmpresa: null };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as IaSaida;

    const decisores = (parsed.decisores ?? [])
      .filter((d) => d.nome && d.nome.trim().length > 2)
      .map<DecisorRico>((d) => ({
        apollo_id: null,
        nome: d.nome!.trim(),
        cargo: d.cargo?.trim() || null,
        email: d.email?.includes("@") ? d.email.trim().toLowerCase() : null,
        telefone: d.telefone?.trim() || null,
        linkedin_url: d.linkedin_url?.includes("linkedin.com") ? d.linkedin_url : null,
        fonte: "ia",
        confianca: d.confianca === "alta" ? "alta" : d.confianca === "baixa" ? "baixa" : "media",
      }));

    return { decisores, resumoEmpresa: parsed.resumo_empresa?.trim() || null };
  } catch (e) {
    console.error("[hunter] IA erro:", e);
    return { decisores: [], resumoEmpresa: null };
  }
}

/** Mescla listas de fontes diferentes priorizando dados mais completos. */
export function mesclarDecisores(listas: DecisorRico[][]): DecisorRico[] {
  const mapa = new Map<string, DecisorRico>();
  const peso = (d: DecisorRico) =>
    (d.email ? 3 : 0) + (d.telefone ? 2 : 0) + (d.linkedin_url ? 2 : 0) + (d.cargo ? 1 : 0);

  for (const lista of listas) {
    if (!Array.isArray(lista)) continue;
    for (const d of lista) {

      const chave = d.nome.toLowerCase().replace(/[^a-zà-ú\s]/gi, "").trim();
      const atual = mapa.get(chave);
      if (!atual) {
        mapa.set(chave, d);
        continue;
      }
      mapa.set(chave, {
        ...atual,
        cargo: atual.cargo ?? d.cargo,
        email: atual.email ?? d.email,
        telefone: atual.telefone ?? d.telefone,
        linkedin_url: atual.linkedin_url ?? d.linkedin_url,
        apollo_id: atual.apollo_id ?? d.apollo_id,
        resumo: atual.resumo ?? d.resumo,
        fonte: peso(d) > peso(atual) ? d.fonte : atual.fonte,
        confianca: atual.confianca === "alta" || d.confianca === "alta" ? "alta" : atual.confianca,
      });
    }
  }

  return Array.from(mapa.values()).sort((a, b) => peso(b) - peso(a));
}

/** Identidade da conta LinkedIn conectada (usada como selo de conexão ativa). */
export async function linkedinStatus(): Promise<{ conectado: boolean; nome: string | null }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const liKey = process.env.LINKEDIN_API_KEY;
  if (!lovableKey || !liKey) return { conectado: false, nome: null };
  try {
    const res = await fetch(`${GATEWAY}/linkedin/v2/userinfo`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": liKey },
    });
    if (!res.ok) return { conectado: false, nome: null };
    const json = (await res.json()) as { name?: string };
    return { conectado: true, nome: json.name ?? null };
  } catch {
    return { conectado: false, nome: null };
  }
}

/**
 * Enriquecimento dos perfis do LinkedIn a partir do snippet público da busca.
 *
 * O LinkedIn bloqueia raspagem de páginas de perfil (o Firecrawl responde 403
 * "site não suportado"), por isso NÃO fazemos scrape de /in/ — usamos apenas o
 * título e a descrição já retornados pela busca. E-mail/telefone de terceiros
 * também não são expostos pela API oficial do LinkedIn.
 */
export async function enriquecerPerfisLinkedIn(perfis: DecisorRico[]): Promise<DecisorRico[]> {
  if (!Array.isArray(perfis) || perfis.length === 0) return [];

  return perfis.map((p) => {
    const texto = p.resumo ?? "";
    const email = (texto.match(EMAIL_RE) ?? [])
      .map((e) => e.toLowerCase())
      .find((e) => !/(linkedin|licdn|example|no-?reply)/i.test(e));
    const telefone = (texto.match(TEL_RE) ?? [])[0] ?? null;
    return {
      ...p,
      email: p.email ?? email ?? null,
      telefone: p.telefone ?? telefone,
      confianca: email || telefone ? ("alta" as const) : p.confianca,
    };
  });
}


/** Padrões corporativos mais comuns no Brasil, usados como e-mail provável. */
export function inferirEmailProvavel(nome: string, dominio: string | null, exemplos: string[]): string | null {
  if (!dominio) return null;
  const partes = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 1 && !["de", "da", "do", "dos", "das"].includes(p));
  if (partes.length < 2) return null;
  const primeiro = partes[0]!;
  const ultimo = partes[partes.length - 1]!;

  // Detecta o padrão a partir de e-mails reais do site (ex.: nome.sobrenome@)
  const amostra = exemplos.find((e) => e.endsWith(`@${dominio}`) && /[a-z]+[._][a-z]+@/.test(e));
  if (amostra) {
    const sep = amostra.split("@")[0]!.includes(".") ? "." : "_";
    return `${primeiro}${sep}${ultimo}@${dominio}`;
  }
  return `${primeiro}.${ultimo}@${dominio}`;
}
