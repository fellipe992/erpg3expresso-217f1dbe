import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exigirGestor(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["administrador", "gestor"]);
  if (!data?.length) throw new Error("Apenas administradores ou gestores.");
}

export const testarTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ chatId: z.number().int() }).parse(i))
  .handler(async ({ data, context }) => {
    await exigirGestor(context.supabase, context.userId);
    const { enviarTelegram } = await import("@/lib/alertas-externos.server");
    await enviarTelegram(data.chatId, "✅ <b>Teste G3 Expresso</b>\nOs alertas da torre de controle chegarão aqui.");
    return { ok: true };
  });

/** Gera uma notificação de teste para o próprio usuário (testa push no aparelho). */
export const testarPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tokens } = await context.supabase.from("push_tokens").select("token").eq("user_id", context.userId);
    if (!tokens?.length) throw new Error("Este aparelho ainda não ativou as notificações push.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("notificacoes").insert({
      user_id: context.userId,
      categoria: "sistema",
      tipo: "teste_push",
      titulo: "Teste de notificação G3",
      mensagem: "Se você viu isto na barra do celular, o push está funcionando.",
      prioridade: "alta",
    });
    if (error) throw new Error(error.message);
    return { ok: true, aparelhos: tokens.length };
  });
