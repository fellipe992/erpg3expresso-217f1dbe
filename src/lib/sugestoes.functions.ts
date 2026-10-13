import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Schema = Record<string, unknown>;
const str = { type: "string" };
const num = { type: "number" };
const arr = (items: Schema) => ({ type: "array", items });
const obj = (properties: Record<string, Schema>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

async function ia(instrucoes: string, entrada: string, nome: string, schema: Schema): Promise<unknown> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("IA não configurada.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      store: false,
      reasoning: { effort: "low" },
      instructions: instrucoes,
      input: entrada,
      text: { format: { type: "json_schema", name: nome, strict: true, schema } },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Muitas solicitações agora. Tente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    throw new Error(`Falha na IA [${res.status}]: ${t.slice(0, 300)}`);
  }
  const j = (await res.json()) as { output?: { content?: { type?: string; text?: string }[] }[] };
  const texto = (j.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? "{}";
  return JSON.parse(texto);
}

const BASE = `Você é analista comercial da G3 Expresso, transportadora rodoviária brasileira (carga seca, refrigerada, lotação, fracionado, armazenagem/cross-docking).
Responda em português do Brasil, objetivo. Nunca invente fatos sobre empresas; quando inferir, diga que é hipótese.`;

export type Sugestao = { indice: number; fit: number; motivo: string; segmento: string; dor_provavel: string };

export const pontuarSugestoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { perfil: string; candidatos: { nome: string; endereco: string | null; website: string | null }[] }) => ({
    perfil: String(d.perfil ?? "").slice(0, 60),
    candidatos: (d.candidatos ?? []).slice(0, 25).map((c) => ({
      nome: String(c.nome ?? "").slice(0, 150),
      endereco: String(c.endereco ?? "").slice(0, 200),
      website: String(c.website ?? "").slice(0, 150),
    })),
  }))
  .handler(async ({ data, context }) => {
    if (!data.candidatos.length) return { sugestoes: [] as Sugestao[] };
    const { data: clientes } = await context.supabase.from("clientes").select("razao_social").limit(40);
    const carteira = (clientes ?? []).map((c: { razao_social: string | null }) => c.razao_social).filter(Boolean).join(", ");
    const r = (await ia(
      `${BASE}
Tarefa: dar um Fit Score (0-100) a cada empresa candidata para o perfil "${data.perfil}" da G3, comparando com o padrão da carteira atual.
Alto fit = embarcador/indústria/distribuidor que gera volume recorrente rodoviário do perfil. Baixo fit = varejo pequeno, transportadoras concorrentes, órgãos públicos.
Para cada uma: segmento provável, motivo curto (1 frase) e dor logística provável.`,
      `CARTEIRA ATUAL DA G3: ${carteira || "(não informada)"}\n\nCANDIDATAS:\n${data.candidatos
        .map((c, i) => `${i}. ${c.nome} | ${c.endereco} | ${c.website}`)
        .join("\n")}`,
      "sugestoes",
      obj({ sugestoes: arr(obj({ indice: num, fit: num, motivo: str, segmento: str, dor_provavel: str })) }),
    )) as { sugestoes: Sugestao[] };
    return r;
  });

export type Organograma = {
  resumo: string;
  niveis: {
    nivel: string;
    estrategia: string;
    cargos: { cargo: string; termo_busca: string; o_que_importa: string; gancho_linkedin: string; gancho_whatsapp: string; pergunta: string }[];
  }[];
};

export const mapearOrganograma = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { empresa: string; segmento: string; perfil: string }) => ({
    empresa: String(d.empresa ?? "").slice(0, 150),
    segmento: String(d.segmento ?? "").slice(0, 150),
    perfil: String(d.perfil ?? "").slice(0, 60),
  }))
  .handler(async ({ data }) => {
    return (await ia(
      `${BASE}
Tarefa: montar o organograma de prospecção (multi-threading) da empresa, do operacional ao topo, nesta ordem de níveis:
"Operação" (estagiário, assistente/analista de logística, conferente, expedição), "Supervisão e Compras" (supervisor de logística, comprador, consultor, vendedor interno),
"Gestão" (gerente/coordenador de logística, supply chain, gestor de transportes), "Diretoria" (diretor de operações, CEO/presidente).
Para cada cargo: termo de busca para LinkedIn, o que normalmente importa e o que essa pessoa costuma publicar/curtir, um gancho de mensagem de conexão no LinkedIn (até 300 caracteres, humano),
um gancho de WhatsApp curto e uma pergunta de sondagem (SPIN). Estratégia por nível: começar pelo operacional para descobrir as dores reais e chegar à diretoria com prova.`,
      `EMPRESA: ${data.empresa}\nSEGMENTO: ${data.segmento || "?"}\nPERFIL G3: ${data.perfil}`,
      "organograma",
      obj({
        resumo: str,
        niveis: arr(
          obj({
            nivel: str,
            estrategia: str,
            cargos: arr(obj({ cargo: str, termo_busca: str, o_que_importa: str, gancho_linkedin: str, gancho_whatsapp: str, pergunta: str })),
          }),
        ),
      }),
    )) as Organograma;
  });
