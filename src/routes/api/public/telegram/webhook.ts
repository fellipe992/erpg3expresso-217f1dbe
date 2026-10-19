import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function segredo(key: string) {
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}
function igual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Registra os chats/grupos onde o bot foi adicionado, para cadastro na torre. */
export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.TELEGRAM_API_KEY;
        if (!key) return new Response("Not configured", { status: 503 });
        if (!igual(request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "", segredo(key))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const update = await request.json().catch(() => null);
        const msg = update?.message ?? update?.my_chat_member;
        const chat = msg?.chat;
        if (!chat || typeof chat.id !== "number") return Response.json({ ok: true });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("telegram_chats_detectados").upsert({
          chat_id: chat.id,
          titulo: String(chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" ") ?? "").slice(0, 200),
          tipo: String(chat.type ?? "").slice(0, 30),
          ultimo_texto: typeof msg.text === "string" ? msg.text.slice(0, 300) : null,
          visto_em: new Date().toISOString(),
        });
        if (typeof msg.text === "string" && msg.text.startsWith("/start")) {
          const { enviarTelegram } = await import("@/lib/alertas-externos.server");
          await enviarTelegram(
            chat.id,
            "✅ Bot da G3 Expresso ativo. Este chat já aparece no sistema em Alertas externos para ser liberado.",
          ).catch(() => undefined);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
