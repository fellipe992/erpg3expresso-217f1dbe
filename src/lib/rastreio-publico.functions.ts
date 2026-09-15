import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALFABETO = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function gerarToken(tamanho = 24) {
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALFABETO[b % ALFABETO.length];
  return out;
}

/**
 * Cria (ou reaproveita) o link público de rastreio de uma viagem.
 * A RLS garante que só staff ou o monitor do cliente daquela viagem consegue.
 */
export const criarLinkRastreio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { viagemId: string }) =>
    z.object({ viagemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existente, error: errBusca } = await supabase
      .from("viagem_compartilhamentos")
      .select("token")
      .eq("viagem_id", data.viagemId)
      .is("revogado_em", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errBusca) throw new Error(errBusca.message);
    if (existente?.token) return { token: existente.token };

    const { data: criado, error } = await supabase
      .from("viagem_compartilhamentos")
      .insert({ viagem_id: data.viagemId, token: gerarToken(), created_by: userId })
      .select("token")
      .single();
    if (error) throw new Error(error.message);
    return { token: criado.token };
  });

/** Revoga todos os links ativos de uma viagem. */
export const revogarLinkRastreio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { viagemId: string }) =>
    z.object({ viagemId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("viagem_compartilhamentos")
      .update({ revogado_em: new Date().toISOString() })
      .eq("viagem_id", data.viagemId)
      .is("revogado_em", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
