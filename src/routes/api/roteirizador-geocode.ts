import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const bodySchema = z.object({
  enderecos: z.array(z.string().min(3).max(300)).min(1).max(200),
});

export const Route = createFileRoute("/api/roteirizador-geocode")({
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

        const resolver = async (endereco: string) => {
          const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?address=${encodeURIComponent(
            endereco,
          )}&region=br&language=pt-BR`;
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": connectionKey,
            },
          });
          if (!res.ok) {
            const body = await res.text();
            console.error(`Geocoding falhou [${res.status}]: ${body}`);
            return { endereco, erro: `Falha ${res.status}` };
          }
          const json = (await res.json()) as {
            status?: string;
            results?: Array<{
              formatted_address?: string;
              geometry?: { location?: { lat: number; lng: number } };
              address_components?: Array<{ long_name: string; types: string[] }>;
            }>;
          };
          const primeiro = json.results?.[0];
          if (!primeiro?.geometry?.location) return { endereco, erro: json.status ?? "ZERO_RESULTS" };
          const cidade = primeiro.address_components?.find((c) =>
            c.types.includes("administrative_area_level_2"),
          )?.long_name;
          return {
            endereco,
            enderecoFormatado: primeiro.formatted_address ?? endereco,
            lat: primeiro.geometry.location.lat,
            lng: primeiro.geometry.location.lng,
            regiao: cidade ?? null,
          };
        };

        // lotes de 10 para não saturar o gateway em cargas grandes
        const resultados: unknown[] = [];
        for (let i = 0; i < parsed.enderecos.length; i += 10) {
          const lote = parsed.enderecos.slice(i, i + 10);
          resultados.push(...(await Promise.all(lote.map(resolver))));
        }

        return Response.json({ resultados }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
