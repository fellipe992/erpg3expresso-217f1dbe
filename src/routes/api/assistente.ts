import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type Msg = { role: "user" | "assistant" | "system"; content: string };

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;
const MAX_CONTEXT_CHARS = 20000;

export const Route = createFileRoute("/api/assistente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Require authenticated Supabase user
        const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
        if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.slice(7).trim();
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabasePublishable = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !supabasePublishable) {
          return Response.json({ error: "Server misconfigured" }, { status: 500 });
        }
        const supabase = createClient(supabaseUrl, supabasePublishable, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let body: { messages?: Msg[]; contexto?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const rawMessages = Array.isArray(body.messages) ? body.messages : [];
        if (rawMessages.length === 0) return new Response("messages required", { status: 400 });
        if (rawMessages.length > MAX_MESSAGES) {
          return Response.json({ error: "Too many messages" }, { status: 400 });
        }
        const messages: Msg[] = [];
        for (const m of rawMessages) {
          if (!m || (m.role !== "user" && m.role !== "assistant" && m.role !== "system")) {
            return Response.json({ error: "Invalid message role" }, { status: 400 });
          }
          if (typeof m.content !== "string" || m.content.length === 0) {
            return Response.json({ error: "Invalid message content" }, { status: 400 });
          }
          if (m.content.length > MAX_MESSAGE_CHARS) {
            return Response.json({ error: "Message too long" }, { status: 400 });
          }
          messages.push({ role: m.role, content: m.content });
        }
        const contexto = typeof body.contexto === "string" ? body.contexto.slice(0, MAX_CONTEXT_CHARS) : "";

        const system = `Você é o Assistente Financeiro da G3 Expresso, uma transportadora brasileira. Responda em português do Brasil, de forma direta, objetiva e profissional. Use formatação markdown quando útil (listas, tabelas simples, negrito). Baseie suas respostas EXCLUSIVAMENTE no snapshot de dados abaixo — não invente números. Se a informação não estiver disponível, diga claramente. Valores monetários em BRL.

=== SNAPSHOT ATUAL DOS DADOS ===
${contexto || "(sem dados disponíveis)"}
=== FIM DO SNAPSHOT ===`;

        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3.5-flash",
            messages: [{ role: "system", content: system }, ...messages],
          }),
        });

        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          if (resp.status === 429)
            return Response.json({ error: "Limite de uso atingido. Tente novamente em instantes." }, { status: 429 });
          if (resp.status === 402)
            return Response.json({ error: "Créditos de IA esgotados. Contate o administrador." }, { status: 402 });
          return Response.json({ error: `Erro no gateway de IA: ${text || resp.statusText}` }, { status: 500 });
        }

        const data = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const reply = data.choices?.[0]?.message?.content ?? "";
        return Response.json({ reply });
      },
    },
  },
});
