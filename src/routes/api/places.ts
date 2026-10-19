import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Busca de endereços (Places API New) pelo gateway — a chave do navegador
 * não autoriza mais chamadas de Places, então tudo passa pelo servidor.
 */
const bodySchema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("autocomplete"),
    texto: z.string().min(3).max(300),
    sessionToken: z.string().max(80).optional(),
    bias: z.object({ lat: z.number(), lng: z.number() }).optional(),
  }),
  z.object({
    acao: z.literal("detalhes"),
    placeId: z.string().min(3).max(300),
    sessionToken: z.string().max(80).optional(),
  }),
  z.object({
    acao: z.literal("geocode-reverso"),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
]);

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export const Route = createFileRoute("/api/places")({
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

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response("Dados inválidos", { status: 400 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const connectionKey = process.env.GOOGLE_MAPS_API_KEY;
        if (!lovableKey || !connectionKey)
          return new Response("Google Maps não configurado no backend", { status: 500 });

        const baseHeaders: Record<string, string> = {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": connectionKey,
          "Content-Type": "application/json",
        };

        const falha = async (res: Response) => {
          const body = await res.text();
          console.error(`Places falhou [${res.status}]: ${body}`);
          return new Response(`Busca de endereços indisponível (${res.status})`, { status: 502 });
        };

        if (parsed.acao === "autocomplete") {
          const res = await fetch(`${GATEWAY}/places/v1/places:autocomplete`, {
            method: "POST",
            headers: {
              ...baseHeaders,
              "X-Goog-FieldMask":
                "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
            },
            body: JSON.stringify({
              input: parsed.texto,
              sessionToken: parsed.sessionToken,
              languageCode: "pt-BR",
              regionCode: "BR",
              includedRegionCodes: ["br"],
              ...(parsed.bias
                ? {
                    locationBias: {
                      circle: {
                        center: { latitude: parsed.bias.lat, longitude: parsed.bias.lng },
                        // A Places API aceita no máximo 50 km de raio.
                        radius: 50000,
                      },
                    },
                  }
                : {}),
            }),
          });
          if (!res.ok) return falha(res);
          const json = (await res.json()) as {
            suggestions?: Array<{
              placePrediction?: { placeId?: string; text?: { text?: string } };
            }>;
          };
          const sugestoes = (json.suggestions ?? [])
            .map((s) => ({
              placeId: s.placePrediction?.placeId ?? "",
              texto: s.placePrediction?.text?.text ?? "",
            }))
            .filter((s) => s.placeId && s.texto)
            .slice(0, 6);
          return Response.json({ sugestoes }, { headers: { "Cache-Control": "no-store" } });
        }

        if (parsed.acao === "geocode-reverso") {
          const res = await fetch(
            `${GATEWAY}/maps/api/geocode/json?latlng=${parsed.lat},${parsed.lng}&language=pt-BR&region=br`,
            { headers: baseHeaders },
          );
          if (!res.ok) return falha(res);
          const json = (await res.json()) as {
            results?: Array<{
              formatted_address?: string;
              address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
            }>;
          };
          const primeiro = json.results?.[0];
          const comp = (t: string, curto = false) =>
            primeiro?.address_components?.find((a) => a.types?.includes(t));
          const bairro =
            comp("sublocality_level_1")?.long_name ?? comp("sublocality")?.long_name ?? comp("neighborhood")?.long_name ?? null;
          const cidade = comp("administrative_area_level_2")?.long_name ?? comp("locality")?.long_name ?? null;
          const uf = comp("administrative_area_level_1")?.short_name ?? null;
          return Response.json(
            {
              endereco: primeiro?.formatted_address ?? "",
              lat: parsed.lat,
              lng: parsed.lng,
              bairro,
              cidade,
              uf,
            },
            { headers: { "Cache-Control": "no-store" } },
          );
        }

        const params = new URLSearchParams({ languageCode: "pt-BR", regionCode: "BR" });
        if (parsed.sessionToken) params.set("sessionToken", parsed.sessionToken);
        const res = await fetch(
          `${GATEWAY}/places/v1/places/${encodeURIComponent(parsed.placeId)}?${params.toString()}`,
          {
            headers: {
              ...baseHeaders,
              "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents,viewport",
            },
          },
        );
        if (!res.ok) return falha(res);
        const json = (await res.json()) as {
          formattedAddress?: string;
          displayName?: { text?: string };
          location?: { latitude?: number; longitude?: number };
          addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
          viewport?: { low?: { latitude?: number; longitude?: number }; high?: { latitude?: number; longitude?: number } };
        };
        const comp = (t: string, curto = false) => {
          const c = json.addressComponents?.find((a) => a.types?.includes(t));
          return (curto ? c?.shortText : c?.longText) ?? null;
        };
        const lo = json.viewport?.low, hi = json.viewport?.high;
        let raio: number | null = null;
        if (lo?.latitude != null && hi?.latitude != null && lo.longitude != null && hi.longitude != null) {
          const dLat = (hi.latitude - lo.latitude) * 111000;
          const dLng = (hi.longitude - lo.longitude) * 111000 * Math.cos((lo.latitude * Math.PI) / 180);
          raio = Math.round(Math.sqrt(dLat * dLat + dLng * dLng) / 2);
        }
        return Response.json(
          {
            endereco: json.formattedAddress ?? json.displayName?.text ?? "",
            lat: json.location?.latitude ?? null,
            lng: json.location?.longitude ?? null,
            nome: json.displayName?.text ?? null,
            bairro: comp("sublocality_level_1") ?? comp("sublocality") ?? comp("neighborhood"),
            cidade: comp("administrative_area_level_2") ?? comp("locality"),
            uf: comp("administrative_area_level_1", true),
            raio,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
