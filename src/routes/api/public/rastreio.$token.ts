import { createFileRoute } from "@tanstack/react-router";

const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

/**
 * Endpoint público do rastreio compartilhado.
 * Devolve APENAS a posição atual do veículo — nenhum dado do motorista,
 * cliente, placa ou valor é projetado aqui.
 */
export const Route = createFileRoute("/api/public/rastreio/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = (params.token ?? "").trim();
        if (!token || token.length < 10 || token.length > 64 || !/^[A-Za-z0-9]+$/.test(token)) {
          return Response.json({ status: "invalido" }, { status: 404, headers });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: share } = await supabaseAdmin
          .from("viagem_compartilhamentos")
          .select("viagem_id, revogado_em")
          .eq("token", token)
          .maybeSingle();

        if (!share || share.revogado_em) {
          return Response.json({ status: "invalido" }, { status: 404, headers });
        }

        const { data: viagem } = await supabaseAdmin
          .from("viagens")
          .select("status")
          .eq("id", share.viagem_id)
          .maybeSingle();

        if (!viagem || viagem.status !== "em_andamento") {
          return Response.json({ status: "encerrado" }, { headers });
        }

        const { data: loc } = await supabaseAdmin
          .from("viagem_localizacoes")
          .select("latitude, longitude, created_at")
          .eq("viagem_id", share.viagem_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!loc) {
          return Response.json({ status: "aguardando" }, { headers });
        }

        return Response.json(
          {
            status: "ativo",
            latitude: loc.latitude,
            longitude: loc.longitude,
            atualizadoEm: loc.created_at,
          },
          { headers },
        );
      },
    },
  },
});
