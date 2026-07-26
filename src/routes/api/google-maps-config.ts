import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/google-maps-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Exige usuário autenticado — a chave nunca é exposta publicamente.
        const authHeader =
          request.headers.get("Authorization") || request.headers.get("authorization");
        const token = authHeader?.toLowerCase().startsWith("bearer ")
          ? authHeader.slice(7).trim()
          : "";
        if (!token) {
          return new Response("Unauthorized", {
            status: 401,
            headers: { "Cache-Control": "no-store" },
          });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabasePublishable) {
          return new Response("Server misconfigured", { status: 500 });
        }
        const supabase = createClient(supabaseUrl, supabasePublishable, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) {
          return new Response("Unauthorized", {
            status: 401,
            headers: { "Cache-Control": "no-store" },
          });
        }

        const key = process.env.GOOGLE_API_KEY;
        if (!key) {
          return new Response("GOOGLE_API_KEY não configurada no backend", {
            status: 500,
            headers: { "Cache-Control": "no-store" },
          });
        }

        return Response.json(
          {
            key,
            channel:
              process.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID ??
              "g3-expresso-erp",
          },
          {
            headers: {
              "Cache-Control": "no-store, max-age=0",
              "X-Robots-Tag": "noindex",
            },
          },
        );
      },
    },
  },
});
