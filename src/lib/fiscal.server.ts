/**
 * Cliente HTTP da API pública da Bsoft / Hivecloud (CT-e e MDF-e).
 * Uso exclusivo em server functions — o token nunca chega ao navegador.
 */

const CTE_BASE = "https://cte-api.hivecloud.com.br/api";
const MDFE_BASE = "https://mdfe-api.hivecloud.com.br/api";

export type Produto = "cte" | "mdfe";

export function credenciais() {
  const token = process.env["BSOFT_API_TOKEN"];
  const tenant = process.env["BSOFT_TENANT_ID"];
  return { token, tenant, configurado: !!token && !!tenant };
}

function base(produto: Produto) {
  return produto === "cte" ? CTE_BASE : MDFE_BASE;
}

export async function bsoft<T = unknown>(
  produto: Produto,
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const { token, tenant, configurado } = credenciais();
  if (!configurado) {
    throw new Error(
      "Integração com a Bsoft não configurada. Cadastre o token e o tenantID nas configurações de integração.",
    );
  }

  const url = new URL(base(produto) + path);
  for (const [k, v] of Object.entries(init.query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      tenantID: String(tenant),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const texto = await res.text();
  if (!res.ok) {
    console.error(`Bsoft ${produto} ${init.method ?? "GET"} ${path} falhou [${res.status}]: ${texto}`);
    throw new Error(`Bsoft respondeu ${res.status}: ${texto.slice(0, 1200)}`);
  }
  if (!texto) return undefined as T;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return texto as unknown as T;
  }
}

export const somenteDigitos = (v: unknown) => String(v ?? "").replace(/\D+/g, "");
