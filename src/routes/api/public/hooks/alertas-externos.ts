import { createFileRoute } from "@tanstack/react-router";

/**
 * Chamado pelo banco a cada nova notificação. Não recebe dados: apenas drena
 * a fila interna de alertas pendentes, então chamadas externas são inofensivas.
 */
export const Route = createFileRoute("/api/public/hooks/alertas-externos")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processarFilaAlertas } = await import("@/lib/alertas-externos.server");
        try {
          const r = await processarFilaAlertas(supabaseAdmin);
          return Response.json({ ok: true, processados: r.processados });
        } catch {
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
