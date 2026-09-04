/**
 * Clientes HTTP para geração de CIOT. Uso exclusivo em server functions.
 *
 * Dois caminhos automáticos:
 *  - Bsoft/Hivecloud (mesmas credenciais do CT-e/MDF-e), base ciot-api.hivecloud.com.br;
 *  - Gestora de pagamento de frete genérica (Repom, Pamcary, e-Frete etc.), configurada
 *    por variáveis de ambiente para não amarrar o sistema a um fornecedor.
 */

import { getCredenciaisCiot } from "@/lib/fiscal.server";

const BSOFT_CIOT_BASE = "https://ciot-api.hivecloud.com.br/api";

type SupabaseLike = { from: (t: string) => any };

export function credenciaisCiotGestora() {
  const baseUrl = process.env["CIOT_GESTORA_BASE_URL"];
  const token = process.env["CIOT_GESTORA_TOKEN"];
  const header = process.env["CIOT_GESTORA_AUTH_HEADER"] ?? "Authorization";
  const prefixo = process.env["CIOT_GESTORA_AUTH_PREFIX"] ?? "Bearer ";
  return { baseUrl, token, header, prefixo, configurado: !!baseUrl && !!token };
}

type Req = { method?: string; body?: unknown; path: string };

async function chamar(url: string, headers: Record<string, string>, req: Req) {
  const res = await fetch(url, {
    method: req.method ?? "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
  });
  const texto = await res.text();
  if (!res.ok) {
    console.error(`CIOT ${req.method ?? "POST"} ${req.path} falhou [${res.status}]: ${texto}`);
    throw new Error(`O provedor de CIOT respondeu ${res.status}: ${texto.slice(0, 1200)}`);
  }
  if (!texto) return undefined as unknown;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return texto as unknown;
  }
}

export async function ciotBsoft<T = unknown>(supabase: SupabaseLike, req: Req): Promise<T> {
  const { token, tenant, configurado } = await getCredenciaisCiot(supabase);
  if (!configurado) {
    throw new Error("Integração com a Bsoft não configurada. Cadastre o token e o tenantID de acesso em Configurações > Integrações fiscais.");
  }
  return (await chamar(BSOFT_CIOT_BASE + req.path, {
    Authorization: `Bearer ${token}`,
    tenantID: String(tenant),
  }, req)) as T;
}

export async function ciotGestora<T = unknown>(req: Req): Promise<T> {
  const { baseUrl, token, header, prefixo, configurado } = credenciaisCiotGestora();
  if (!configurado) {
    throw new Error(
      "Gestora de pagamento de frete não configurada. Cadastre o endereço da API e o token de acesso da gestora.",
    );
  }
  return (await chamar(baseUrl!.replace(/\/+$/, "") + req.path, { [header]: `${prefixo}${token}` }, req)) as T;
}
