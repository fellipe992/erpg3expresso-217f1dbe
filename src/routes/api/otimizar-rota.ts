import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const bodySchema = z.object({
  origem: z.string().min(2).max(300),
  destino: z.string().min(2).max(300),
  paradas: z.array(z.string().min(2).max(300)).min(2).max(25),
});

export const Route = createFileRoute("/api/otimizar-rota")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader =
          request.headers.get("Authorization") || request.headers.get("authorization");
        const token = authHeader?.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabasePublishable)
          return new Response("Server misconfigured", { status: 500 });

        const supabase = createClient(supabaseUrl, supabasePublishable, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) return new Response("Unauthorized", { status: 401 });

        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response("Dados inválidos", { status: 400 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const connectionKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!lovableKey || !connectionKey)
          return new Response("Google Maps não configurado no backend", { status: 500 });

        const response = await fetch(
          "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": connectionKey,
              "Content-Type": "application/json",
              "X-Goog-FieldMask":
                "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex",
            },
            body: JSON.stringify({
              origin: { address: parsed.origem },
              destination: { address: parsed.destino },
              intermediates: parsed.paradas.map((address) => ({ address, via: false })),
              optimizeWaypointOrder: true,
              travelMode: "DRIVE",
              languageCode: "pt-BR",
              regionCode: "BR",
              units: "METRIC",
            }),
          },
        );

        if (!response.ok) {
          const text = await response.text();
          console.error(`Routes API (otimizar) falhou [${response.status}]: ${text}`);
          return new Response(`Falha ao otimizar a rota [${response.status}]: ${text}`, {
            status: response.status,
          });
        }

        const json = (await response.json()) as {
          routes?: Array<{
            distanceMeters?: number;
            duration?: string;
            optimizedIntermediateWaypointIndex?: number[];
          }>;
        };
        const rota = json.routes?.[0];
        if (!rota) return new Response("Nenhuma rota encontrada", { status: 404 });

        return Response.json(
          {
            ordem:
              rota.optimizedIntermediateWaypointIndex ?? parsed.paradas.map((_, i) => i),
            km: (rota.distanceMeters ?? 0) / 1000,
            minutos: Math.round(Number(String(rota.duration ?? "0s").replace("s", "")) / 60),
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
