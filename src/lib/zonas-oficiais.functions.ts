import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** "Atualizar agora": só administradores. Reimporta o ano atual da PRF e recalcula. */
export const atualizarZonasOficiaisAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: role } = await context.supabase.rpc("get_primary_role", { _user_id: context.userId });
    if (role !== "administrador") throw new Error("Apenas administradores podem atualizar os dados oficiais.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { anoAtualSP, atualizarZonasOficiais } = await import("@/lib/zonas-oficiais.server");
    return atualizarZonasOficiais(supabaseAdmin, [anoAtualSP()]);
  });
