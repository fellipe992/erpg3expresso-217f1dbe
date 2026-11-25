import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "Atualizar agora": só administradores. Reimporta o ano atual da PRF e recalcula. */
export const atualizarZonasOficiaisAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "administrador");
    if (roleErr) throw new Error(roleErr.message);
    if (!roles?.length) throw new Error("Apenas administradores podem atualizar os dados oficiais.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { anoAtualSP, atualizarZonasOficiais } = await import("@/lib/zonas-oficiais.server");
    return atualizarZonasOficiais(supabaseAdmin, [anoAtualSP()]);
  });
