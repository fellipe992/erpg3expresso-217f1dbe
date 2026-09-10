import { supabase } from "@/integrations/supabase/client";

export type SugestaoLocal = { placeId: string; texto: string };

async function chamar<T>(body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada");
  const res = await fetch("/api/places", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

/** Gera um token de sessão de autocomplete (reaproveitado enquanto o usuário digita). */
export const novoSessionToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export async function buscarSugestoesEndereco(
  texto: string,
  opcoes: { sessionToken?: string; bias?: { lat: number; lng: number } } = {},
): Promise<SugestaoLocal[]> {
  const { sugestoes } = await chamar<{ sugestoes: SugestaoLocal[] }>({
    acao: "autocomplete",
    texto,
    sessionToken: opcoes.sessionToken,
    bias: opcoes.bias,
  });
  return sugestoes;
}

export async function detalhesEndereco(placeId: string, sessionToken?: string) {
  return chamar<{ endereco: string; lat: number | null; lng: number | null }>({
    acao: "detalhes",
    placeId,
    sessionToken,
  });
}
