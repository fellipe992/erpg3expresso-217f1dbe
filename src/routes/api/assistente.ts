import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "user" | "assistant" | "system"; content: string };

export const Route = createFileRoute("/api/assistente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let body: { messages?: Msg[]; contexto?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const messages = Array.isArray(body.messages) ? body.messages : [];
        if (messages.length === 0) return new Response("messages required", { status: 400 });

        const system = `Você é o Assistente Financeiro da G3 Expresso, uma transportadora brasileira. Responda em português do Brasil, de forma direta, objetiva e profissional. Use formatação markdown quando útil (listas, tabelas simples, negrito). Baseie suas respostas EXCLUSIVAMENTE no snapshot de dados abaixo — não invente números. Se a informação não estiver disponível, diga claramente. Valores monetários em BRL.

=== SNAPSHOT ATUAL DOS DADOS ===
${body.contexto ?? "(sem dados disponíveis)"}
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
