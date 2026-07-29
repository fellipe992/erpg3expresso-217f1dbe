import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const bodySchema = z.object({
  pontos: z.array(z.string().min(2).max(300)).min(2).max(30),
  tipoRota: z.enum(["eficiente", "curta", "sem_pedagio"]).default("eficiente"),
  eixos: z.number().int().min(2).max(9).default(6),
  tipoVeiculo: z.string().max(30).default("caminhao"),
});

type Money = { units?: string; nanos?: number } | undefined;

const toNumber = (p: Money) => (p ? Number(p.units ?? 0) + (p.nanos ?? 0) / 1e9 : 0);

/** Google devolve o pedágio para veículo de passeio (2 eixos). No Brasil a tarifa é por eixo. */
function fatorEixos(tipoVeiculo: string, eixos: number) {
  if (tipoVeiculo === "moto") return 0.5;
  if (tipoVeiculo === "carro" || tipoVeiculo === "van") return Math.max(1, eixos / 2);
  return eixos / 2;
}

export const Route = createFileRoute("/api/planejador-rota")({
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
          global: { headers: { Authorization: `Bearer ${token}` } },
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

        const pontos = parsed.pontos;
        const body = {
          origin: { address: pontos[0] },
          destination: { address: pontos[pontos.length - 1] },
          intermediates: pontos.slice(1, -1).map((address) => ({ address })),
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          computeAlternativeRoutes: parsed.tipoRota === "curta",
          extraComputations: ["TOLLS"],
          routeModifiers: {
            avoidTolls: parsed.tipoRota === "sem_pedagio",
            vehicleInfo: { emissionType: "DIESEL" },
          },
          languageCode: "pt-BR",
          regionCode: "BR",
          units: "METRIC",
        };

        const response = await fetch(
          "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": connectionKey,
              "Content-Type": "application/json",
              "X-Goog-FieldMask":
                "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.viewport,routes.description,routes.travelAdvisory.tollInfo,routes.legs.distanceMeters,routes.legs.duration,routes.legs.travelAdvisory.tollInfo",
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const text = await response.text();
          console.error(`Routes API falhou [${response.status}]: ${text}`);
          return new Response(`Falha ao calcular a rota [${response.status}]: ${text}`, {
            status: response.status,
          });
        }

        const json = (await response.json()) as { routes?: any[] };
        const rotas = json.routes ?? [];
        if (!rotas.length) return new Response("Nenhuma rota encontrada", { status: 404 });

        const rota =
          parsed.tipoRota === "curta"
            ? rotas.reduce((a, b) => (b.distanceMeters < a.distanceMeters ? b : a))
            : rotas[0];

        const fator = fatorEixos(parsed.tipoVeiculo, parsed.eixos);
        const legs = (rota.legs ?? []).map((leg: any, i: number) => ({
          indice: i,
          de: pontos[i],
          para: pontos[i + 1],
          km: (leg.distanceMeters ?? 0) / 1000,
          minutos: Math.round(Number(String(leg.duration ?? "0s").replace("s", "")) / 60),
          pedagio:
            toNumber(leg.travelAdvisory?.tollInfo?.estimatedPrice?.[0] as Money) * fator,
        }));

        const pedagioTotal =
          toNumber(rota.travelAdvisory?.tollInfo?.estimatedPrice?.[0] as Money) * fator ||
          legs.reduce((s: number, l: any) => s + l.pedagio, 0);

        return Response.json(
          {
            km: (rota.distanceMeters ?? 0) / 1000,
            minutos: Math.round(Number(String(rota.duration ?? "0s").replace("s", "")) / 60),
            polyline: rota.polyline?.encodedPolyline ?? "",
            viewport: rota.viewport ?? null,
            pedagioTotal,
            trechos: legs,
            fatorEixos: fator,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
