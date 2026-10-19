import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Atualização mensal das zonas oficiais (chamada pelo agendamento do banco).
 * Só baixa dados públicos e recalcula níveis de zonas oficiais; nunca altera
 * zonas G3 nem reportes. Aceita apenas anos dentro da janela de 3 anos.
 */
export const Route = createFileRoute("/api/public/hooks/zonas-oficiais")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { anoAtualSP, atualizarZonasOficiais } = await import("@/lib/zonas-oficiais.server");
        const atual = anoAtualSP();
        const body = z
          .object({ ano: z.number().int().min(atual - 2).max(atual).optional() })
          .safeParse(await request.json().catch(() => ({})));
        if (!body.success) return Response.json({ error: "Ano inválido" }, { status: 400 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          const r = await atualizarZonasOficiais(supabaseAdmin, [body.data.ano ?? atual]);
          return Response.json({ ok: true, ...r });
        } catch (e) {
          return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
