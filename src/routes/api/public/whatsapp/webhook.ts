import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";

// Recebe mensagens e status do WhatsApp (assinados pelo gateway do Lovable).
export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("not configured", { status: 500 });
        const deliveryId = request.headers.get("X-Lovable-Delivery");
        const event = request.headers.get("X-Lovable-Event");
        let payload: unknown;
        try {
          ({ payload } = await verifyWebhookRequest({ req: request, secret, maxBodyBytes: 4 * 1024 * 1024 }));
        } catch {
          return new Response("invalid signature", { status: 401 });
        }
        if (!deliveryId || !event) return new Response("missing headers", { status: 400 });

        const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
        const { processarEvento, recuperarPendentes } = await import("@/lib/whatsapp.server");

        const { error: insErr } = await admin
          .from("whatsapp_webhook_events")
          .upsert({ delivery_id: deliveryId, event, payload: payload as never }, { onConflict: "delivery_id", ignoreDuplicates: true });
        if (insErr) return new Response("store failed", { status: 500 });

        const { data: row, error } = await admin
          .from("whatsapp_webhook_events")
          .select("id, event, payload, attempts, processed_at")
          .eq("delivery_id", deliveryId)
          .single();
        if (error || !row) return new Response("store failed", { status: 500 });

        if (!row.processed_at) {
          const ok = await processarEvento(admin, row);
          if (!ok) return new Response("processing failed", { status: 500 });
        }
        // Recupera trabalho que ficou pendente após as tentativas do gateway.
        await recuperarPendentes(admin, 3).catch(() => {});
        return new Response("ok");
      },
    },
  },
});
