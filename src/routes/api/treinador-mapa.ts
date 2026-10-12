import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/api/treinador-mapa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("Authorization") ?? "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        const url = process.env.SUPABASE_URL;
        const pub = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!token || !url || !pub) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const sb = createClient(url, pub, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: u } = await sb.auth.getUser(token);
        if (!u?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const body = (await request.json().catch(() => ({}))) as { livro?: string; pontos?: string; stream?: boolean };
        const livro = String(body.livro ?? "").slice(0, 200);
        const pontos = String(body.pontos ?? "").slice(0, 2500);
        if (!livro) return new Response("Livro obrigatório", { status: 400 });
        const stream = body.stream !== false;
        const prompt = `Mapa mental visual de estudo, estilo infográfico educativo profissional, em português do Brasil, formato paisagem.
Título central grande: "${livro}". Ramificações coloridas e organizadas, cada uma com ícone simples, palavra-chave em destaque e uma frase curta de explicação.
Inclua quando houver termo em inglês a tradução entre parênteses. Fundo claro, tipografia legível, hierarquia clara, setas conectando ideias, um quadro "No transporte de cargas" com aplicações práticas.
Conteúdo a representar:
${pontos}`;
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-image-2.5-sunburst",
            prompt,
            size: "1536x1024",
            quality: "high",
            ...(stream ? { stream: true, partial_images: 1 } : {}),
          }),
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
