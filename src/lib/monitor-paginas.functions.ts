import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const FIRECRAWL_GATEWAY_V2 = "https://connector-gateway.lovable.dev/firecrawl/v2";

function normalizarLinhas(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function gerarDiffLinhas(anterior: string | null, atual: string): { mudou: boolean; diff: string } {
  if (!anterior) {
    return { mudou: false, diff: "" };
  }
  const prevSet = new Set(normalizarLinhas(anterior));
  const currLines = normalizarLinhas(atual);
  const currSet = new Set(currLines);
  const removidas = normalizarLinhas(anterior).filter((l) => !currSet.has(l));
  const adicionadas = currLines.filter((l) => !prevSet.has(l));
  if (removidas.length === 0 && adicionadas.length === 0) {
    return { mudou: false, diff: "" };
  }
  const partes = [
    ...adicionadas.slice(0, 60).map((l) => `+ ${l}`),
    ...removidas.slice(0, 60).map((l) => `- ${l}`),
  ];
  return { mudou: true, diff: partes.join("\n") };
}

export const verificarPaginaMonitorada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("ID da página é obrigatório");
    return data;
  })
  .handler(async ({ data, context }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const firecrawlKey = process.env["FIRECRAWL_API_KEY"];
    if (!lovableKey || !firecrawlKey) {
      throw new Error("Integração Firecrawl não configurada no servidor.");
    }

    const { data: pagina, error: fetchErr } = await context.supabase
      .from("paginas_monitoradas")
      .select("id, url, ultimo_conteudo")
      .eq("id", data.id)
      .maybeSingle();

    if (fetchErr || !pagina) {
      throw new Error(fetchErr?.message || "Página não encontrada");
    }

    const agora = new Date().toISOString();
    const resp = await fetch(`${FIRECRAWL_GATEWAY_V2}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": firecrawlKey,
      },
      body: JSON.stringify({
        url: pagina.url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      await context.supabase
        .from("paginas_monitoradas")
        .update({ ultima_verificacao_em: agora, ultimo_erro: `Erro ${resp.status}: ${errBody.slice(0, 240)}` })
        .eq("id", pagina.id);
      throw new Error(`Falha ao consultar página [${resp.status}]: ${errBody.slice(0, 200)}`);
    }

    const json = (await resp.json()) as { data?: { markdown?: string } };
    const markdown = (json.data?.markdown ?? "").trim();
    const { mudou, diff } = gerarDiffLinhas(pagina.ultimo_conteudo, markdown);

    const { error: updErr } = await context.supabase
      .from("paginas_monitoradas")
      .update({
        ultimo_conteudo: markdown.slice(0, 120000),
        ultima_verificacao_em: agora,
        ultimo_erro: null,
        teve_alteracao: mudou,
        ultimo_diff: mudou ? diff : null,
        updated_at: agora,
        ...(mudou ? { alterado_em: agora } : {}),
      })
      .eq("id", pagina.id);
    if (updErr) throw new Error(updErr.message);

    return { id: pagina.id, mudou, primeiraCaptura: !pagina.ultimo_conteudo, diff };
  });