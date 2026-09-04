/**
 * Cliente HTTP da API pública da Bsoft / Hivecloud (CT-e e MDF-e).
 * Uso exclusivo em server functions — o token nunca chega ao navegador.
 */

const CTE_BASE = "https://cte-api.hivecloud.com.br/api";
const MDFE_BASE = "https://mdfe-api.hivecloud.com.br/api";

export type Produto = "cte" | "mdfe";
export type Ambiente = "homologacao" | "producao";

/**
 * Credenciais por ambiente. Em homologação usa o token/tenant de teste quando
 * cadastrados; se não houver, cai no token de produção (a Bsoft aceita o mesmo
 * cadastro com o ambiente informado no envio).
 */
export function credenciais(ambiente: Ambiente = "producao") {
  const prodToken = process.env["BSOFT_API_TOKEN"];
  const prodTenant = process.env["BSOFT_TENANT_ID"];
  const homToken = process.env["BSOFT_API_TOKEN_HOMOLOGACAO"] || prodToken;
  const homTenant = process.env["BSOFT_TENANT_ID_HOMOLOGACAO"] || prodTenant;
  const token = ambiente === "homologacao" ? homToken : prodToken;
  const tenant = ambiente === "homologacao" ? homTenant : prodTenant;
  return {
    token,
    tenant,
    ambiente,
    configurado: !!token && !!tenant,
    homologacaoPropria: !!process.env["BSOFT_API_TOKEN_HOMOLOGACAO"],
  };
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
  const { token, tenant, configurado } = credenciais(ambiente);
  if (!configurado) {
    throw new Error(
      "Integração com a Bsoft não configurada. Cadastre o token e o tenantID nas configurações de integração.",
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
        "A Bsoft recusou as credenciais (erro 401). Confirme, em Configurações > Integrações do emissor " +
          `${produto === "cte" ? "CT-e" : "MDF-e"} da Bsoft, se a integração por API está ativada e copie novamente ` +
          "o token e o tenantID para as configurações de integração deste sistema. O token atual não está autorizado.",
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
