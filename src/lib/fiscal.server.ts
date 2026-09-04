/**
 * Cliente HTTP da API pública da Bsoft / Hivecloud (CT-e e MDF-e).
 * Uso exclusivo em server functions — o token nunca chega ao navegador.
 */

const CTE_BASE = "https://cte-api.hivecloud.com.br/api";
const MDFE_BASE = "https://mdfe-api.hivecloud.com.br/api";

export type Produto = "cte" | "mdfe";
export type Ambiente = "homologacao" | "producao";

type SupabaseLike = { from: (t: string) => any };

/** Lê as credenciais cadastradas no banco (administração) e usa as variáveis de
 *  ambiente legadas como fallback para não quebrar instalações anteriores. */
export async function getCredenciais(supabase: SupabaseLike, ambiente: Ambiente = "producao") {
  const { data } = await supabase
    .from("fiscal_integracao_config")
    .select("bsoft_api_token, bsoft_tenant_id, bsoft_api_token_homologacao, bsoft_tenant_id_homologacao")
    .eq("singleton", true)
    .limit(1)
    .maybeSingle();

  const prodToken = data?.bsoft_api_token || process.env["BSOFT_API_TOKEN"];
  const prodTenant = data?.bsoft_tenant_id || process.env["BSOFT_TENANT_ID"];
  const homToken = data?.bsoft_api_token_homologacao || process.env["BSOFT_API_TOKEN_HOMOLOGACAO"] || prodToken;
  const homTenant = data?.bsoft_tenant_id_homologacao || process.env["BSOFT_TENANT_ID_HOMOLOGACAO"] || prodTenant;
  const token = ambiente === "homologacao" ? homToken : prodToken;
  const tenant = ambiente === "homologacao" ? homTenant : prodTenant;

  return {
    token,
    tenant,
    ambiente,
    configurado: !!token && !!tenant,
    homologacaoPropria: !!(data?.bsoft_api_token_homologacao || process.env["BSOFT_API_TOKEN_HOMOLOGACAO"]),
  };
}

/** Lê as credenciais do CIOT (mesmas da Bsoft) a partir do banco. */
export async function getCredenciaisCiot(supabase: SupabaseLike) {
  const c = await getCredenciais(supabase, "producao");
  return { token: c.token, tenant: c.tenant, configurado: c.configurado };
}

function base(produto: Produto, ambiente: Ambiente) {
  const override =
    ambiente === "homologacao"
      ? produto === "cte"
        ? process.env["BSOFT_CTE_BASE_URL_HOMOLOGACAO"]
        : process.env["BSOFT_MDFE_BASE_URL_HOMOLOGACAO"]
      : produto === "cte"
        ? process.env["BSOFT_CTE_BASE_URL"]
        : process.env["BSOFT_MDFE_BASE_URL"];
  if (override) return override.replace(/\/+$/, "");
  return produto === "cte" ? CTE_BASE : MDFE_BASE;
}

/** Código do ambiente exigido pela SEFAZ nos payloads (1 = produção, 2 = homologação). */
export const codigoAmbiente = (ambiente: Ambiente) => (ambiente === "homologacao" ? 2 : 1);
export const nomeAmbiente = (ambiente: Ambiente) => (ambiente === "homologacao" ? "HOMOLOGACAO" : "PRODUCAO");

export async function bsoft<T = unknown>(
  supabase: SupabaseLike,
  produto: Produto,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
    ambiente?: Ambiente;
  } = {},
): Promise<T> {
  const ambiente: Ambiente = init.ambiente ?? "producao";
  const { token, tenant, configurado } = await getCredenciais(supabase, ambiente);
  if (!configurado) {
    throw new Error(
      "Integração com a Bsoft não configurada. Cadastre o token e o tenantID em Configurações > Integrações fiscais.",
    );
  }

  const url = new URL(base(produto, ambiente) + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      tenantID: String(tenant),
      ambiente: nomeAmbiente(ambiente),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const texto = await res.text();
  if (!res.ok) {
    console.error(`Bsoft ${produto}/${ambiente} ${init.method ?? "GET"} ${path} falhou [${res.status}]: ${texto}`);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "A Bsoft recusou as credenciais (erro 401). Em Configurações > Integrações fiscais, verifique se o token e o tenantID estão corretos. " +
          "O tenantID deve conter apenas números.",
      );
    }
    throw new Error(`Bsoft respondeu ${res.status}: ${texto.slice(0, 1200) || "sem detalhes"}`);
  }

  if (!texto) return undefined as T;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return texto as unknown as T;
  }
}

export const somenteDigitos = (v: unknown) => String(v ?? "").replace(/\D+/g, "");
