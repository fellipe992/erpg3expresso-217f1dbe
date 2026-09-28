import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AuditoriaFoto = {
  nitidez: "boa" | "regular" | "ruim";
  iluminacao: "boa" | "regular" | "ruim";
  ressalvas: string[];
  aprovada: boolean;
  resumo: string;
};

const PROMPT = `Você audita fotos de comprovantes de entrega (canhotos/notas) de uma transportadora.
Avalie a imagem e responda SOMENTE um JSON: {"nitidez":"boa|regular|ruim","iluminacao":"boa|regular|ruim","ressalvas":["textos manuscritos de ressalva/avaria/falta encontrados, transcritos"],"aprovada":true|false,"resumo":"uma frase em português"}.
aprovada=false se nitidez ou iluminação for ruim ou se houver ressalva manual.`;

export const auditarFoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { path: string; mime: string }) => d)
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Auditor de fotos não configurado.");
    const { data: file, error } = await context.supabase.storage.from("viagem-fotos").download(data.path);
    if (error || !file) throw new Error("Não foi possível ler a foto.");
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: PROMPT },
              { type: "input_image", image_url: `data:${data.mime || "image/jpeg"};base64,${b64}` },
            ],
          },
        ],
      }),
    });
    if (!res.ok || !res.body) {
      if (res.status === 402) throw new Error("Créditos de IA esgotados.");
      if (res.status === 429) throw new Error("Muitas análises ao mesmo tempo, tente em instantes.");
      throw new Error(`Falha na análise (${res.status}).`);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(l.slice(5).trim());
          if (ev.type === "response.output_text.delta") text += ev.delta;
        } catch {
          /* ignora */
        }
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("A IA não retornou uma análise.");
    const result = JSON.parse(m[0]) as AuditoriaFoto;
    await context.supabase.from("viagem_anexos").update({ auditoria_ia: result }).eq("storage_path", data.path);
    return result;
  });
