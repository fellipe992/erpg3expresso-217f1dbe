import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/google-maps-config")({
  server: {
    handlers: {
      GET: async () => {
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