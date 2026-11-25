import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  enderecoPareceCortado,
  ordenarDestinos,
  type AgendamentoExtraido,
  type DestinoExtraido,
} from "@/lib/importar-viagem";

const PROMPT_EXTRACAO = `Você extrai dados de um print de agendamento de viagem de transportadora brasileira.
Leia a imagem com atenção e retorne SOMENTE um JSON válido com esta estrutura exata:
{
  "data_viagem": "DD/MM/AAAA ou vazio",
  "viagem_cliente": "número do campo Viagem (ex: 024964) ou vazio",
  "placa": "placa do veículo sem espaços extras (ex: PFY-3J16)",
  "motorista_cpf": "CPF do motorista se aparecer, senão vazio",
  "motorista_nome": "nome completo do motorista em MAIÚSCULAS",
  "destinos": [
    {
      "destino": "nome da escola/cliente na coluna Destino em MAIÚSCULAS",
      "endereco": "endereço na coluna Endereço em MAIÚSCULAS (mantenha exatamente o que está visível, sem inventar número)",
      "bairro": "bairro em MAIÚSCULAS",
      "cidade": "cidade em MAIÚSCULAS",
      "uf": "sigla UF de 2 letras em MAIÚSCULAS",
      "sequencia": "valor da coluna Sequência (ex: 001, 002, 999)"
    }
  ]
}
Regras:
- Extraia TODAS as linhas da tabela de Ponto de Entrega.
- Não invente números cortados no endereço; deixe exatamente como está visível (ex: "R. ANTONIO RAPOSO BARRETO,").
- Retorne apenas o JSON, sem markdown ou texto fora do JSON.`;

const SCHEMA_GEMINI = {
  type: "object",
  properties: {
    data_viagem: { type: "string" },
    viagem_cliente: { type: "string" },
    placa: { type: "string" },
    motorista_cpf: { type: "string" },
    motorista_nome: { type: "string" },
    destinos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          destino: { type: "string" },
          endereco: { type: "string" },
          bairro: { type: "string" },
          cidade: { type: "string" },
          uf: { type: "string" },
          sequencia: { type: "string" },
        },
        required: ["destino", "endereco", "bairro", "cidade", "uf", "sequencia"],
      },
    },
  },
  required: ["data_viagem", "viagem_cliente", "placa", "motorista_cpf", "motorista_nome", "destinos"],
};

async function extrairComGemini(b64: string, mime: string): Promise<AgendamentoExtraido | null> {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) return null;
  for (const modelo of ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.1-flash-lite"]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PROMPT_EXTRACAO },
                { inlineData: { mimeType: mime || "image/jpeg", data: b64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: SCHEMA_GEMINI,
            maxOutputTokens: 4096,
          },
        }),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      };
      const txt = j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]) as AgendamentoExtraido;
    } catch {
      /* tenta próximo modelo */
    }
  }
  return null;
}

async function extrairComGateway(b64: string, mime: string): Promise<AgendamentoExtraido> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Serviço de IA não configurado.");
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
            { type: "input_text", text: PROMPT_EXTRACAO },
            { type: "input_image", image_url: `data:${mime || "image/jpeg"};base64,${b64}` },
          ],
        },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    if (res.status === 402) throw new Error("Créditos de IA esgotados.");
    if (res.status === 429) throw new Error("Muitas leituras ao mesmo tempo, tente em instantes.");
    throw new Error(`Falha na leitura do print (${res.status}).`);
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
  if (!m) throw new Error("A IA não conseguiu ler os dados do print.");
  return JSON.parse(m[0]) as AgendamentoExtraido;
}

async function enriquecerDestinoGoogle(
  d: DestinoExtraido,
  lovableKey: string,
  mapsKey: string,
): Promise<DestinoExtraido> {
  const cortado = enderecoPareceCortado(d.endereco);
  const headers = { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapsKey };
  const baseUrl = "https://connector-gateway.lovable.dev/google_maps";

  // Quando o endereço está sem número/cortado, busca a escola pelo Places Text Search
  if (cortado && d.destino) {
    try {
      const query = [d.destino, d.bairro, d.cidade, d.uf || "SP", "Brasil"].filter(Boolean).join(", ");
      const res = await fetch(`${baseUrl}/places/v1/places:searchText`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "X-Goog-FieldMask": "places.formattedAddress,places.shortFormattedAddress,places.location",
        },
        body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", regionCode: "BR", maxResultCount: 1 }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          places?: Array<{
            shortFormattedAddress?: string;
            formattedAddress?: string;
            location?: { latitude?: number; longitude?: number };
          }>;
        };
        const place = json.places?.[0];
        if (place) {
          const endNovo = (place.shortFormattedAddress || place.formattedAddress || "").split(" - ")[0]?.trim();
          return {
            ...d,
            endereco_original: d.endereco,
            endereco: endNovo ? endNovo.toUpperCase() : d.endereco,
            endereco_corrigido: Boolean(endNovo && /\d/.test(endNovo)),
            lat: place.location?.latitude ?? null,
            lng: place.location?.longitude ?? null,
          };
        }
      }
    } catch {
      /* fallback para geocoding */
    }
  }

  // Geocoding padrão para obter coordenadas (lat/lng)
  try {
    const endBusca = [d.endereco, d.bairro, d.cidade, d.uf || "SP", "Brasil"].filter(Boolean).join(", ");
    const res = await fetch(
      `${baseUrl}/maps/api/geocode/json?address=${encodeURIComponent(endBusca)}&region=br&language=pt-BR`,
      { headers },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        status?: string;
        results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
      };
      const loc = json.status === "OK" ? json.results?.[0]?.geometry?.location : undefined;
      if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
        return { ...d, lat: loc.lat, lng: loc.lng };
      }
    }
  } catch {
    /* segue sem coordenadas */
  }
  return d;
}

const inputSchema = z.object({
  imagemBase64: z.string().min(100).max(15_000_000),
  mime: z.string().min(3).max(60),
});

export const lerAgendamentoPrint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Somente equipe interna pode importar viagens
    const { data: role } = await context.supabase.rpc("get_primary_role", { _user_id: context.userId });
    if (!role || role === "motorista" || role === "monitor") {
      throw new Error("Sem permissão para importar viagens.");
    }

    const extraido =
      (await extrairComGemini(data.imagemBase64, data.mime)) ??
      (await extrairComGateway(data.imagemBase64, data.mime));

    const ordenados = ordenarDestinos(extraido.destinos ?? []).map((d) => ({
      destino: (d.destino ?? "").trim().toUpperCase(),
      endereco: (d.endereco ?? "").trim().toUpperCase(),
      bairro: (d.bairro ?? "").trim().toUpperCase(),
      cidade: (d.cidade ?? "").trim().toUpperCase(),
      uf: (d.uf ?? "").trim().toUpperCase().slice(0, 2),
      sequencia: (d.sequencia ?? "").trim(),
    }));

    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapsKey = process.env["GOOGLE_MAPS_API_KEY"];
    const destinosEnriquecidos =
      lovableKey && mapsKey
        ? await Promise.all(ordenados.map((d) => enriquecerDestinoGoogle(d, lovableKey, mapsKey)))
        : ordenados;

    return {
      data_viagem: (extraido.data_viagem ?? "").trim(),
      viagem_cliente: (extraido.viagem_cliente ?? "").trim(),
      placa: (extraido.placa ?? "").trim().toUpperCase(),
      motorista_cpf: (extraido.motorista_cpf ?? "").trim(),
      motorista_nome: (extraido.motorista_nome ?? "").trim().toUpperCase(),
      destinos: destinosEnriquecidos,
    } satisfies AgendamentoExtraido;
  });