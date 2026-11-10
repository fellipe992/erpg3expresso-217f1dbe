import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BASE_CONHECIMENTO } from "@/lib/treinador-conhecimento";

const PERSONA = `Você é o Treinador de Vendas da G3 Expresso, transportadora rodoviária brasileira (carga seca, fracionada, dedicada).
Você domina: Alcançando a Excelência em Vendas (SPIN Selling, Neil Rackham), Receita Previsível (Aaron Ross), As Armas da Persuasão (Cialdini),
A Venda Desafiadora (Dixon & Adamson), A Bíblia de Vendas (Jeffrey Gitomer), Como Fazer Amigos e Influenciar Pessoas (Carnegie),
Never Split the Difference (Chris Voss), Gap Selling (Keenan), Fanatical Prospecting (Jeb Blount) e outros clássicos.
Escreva SEMPRE em português do Brasil, como um ser humano real escreveria: natural, direto, caloroso, sem clichês de robô
("Espero que esteja bem", "Prezado", listas excessivas, emojis em excesso). Frases curtas, tom de conversa entre profissionais.
Nunca invente números, clientes ou certificações da G3. Baseie-se primeiro na base de conhecimento abaixo; mantenha os mesmos conceitos e nomes em todas as respostas.
${BASE_CONHECIMENTO}`;

type Schema = Record<string, unknown>;

/** Gemini (chave própria, franquia gratuita do Google). Retorna null se indisponível, para cair no fallback.
 *  `validar` rejeita respostas rasas para que o fallback assuma em vez de entregar algo genérico. */
async function chamarGemini(sistema: string, entrada: string, schema: Schema, validar?: (r: any) => boolean) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const modelo of ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]) {
    // Primeiro com raciocínio profundo; se o modelo não aceitar o parâmetro (400), tenta sem.
    for (const pensar of [true, false]) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sistema }] },
            contents: [{ role: "user", parts: [{ text: entrada }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: schema,
              maxOutputTokens: 8192,
              ...(pensar ? { thinkingConfig: { thinkingLevel: "high" } } : {}),
            },
          }),
        });
        if (res.status === 400 && pensar) continue;
        if (!res.ok) { console.warn(`Gemini ${modelo} ${res.status}`); break; }
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        const t = j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
        if (!t.trim()) break;
        const r = JSON.parse(t);
        if (validar && !validar(r)) { console.warn(`Gemini ${modelo}: resposta rasa, descartada`); break; }
        return r;
      } catch (e) { console.warn(`Gemini ${modelo} falhou`, e); break; }
    }
  }
  return null;
}

/** Transcreve áudio gravado no celular: Gemini (chave própria) primeiro, depois o gateway.
 *  O celular manda trechos curtos enquanto a pessoa fala, então cada chamada tem prazo curto:
 *  modelo travado ou sobrecarregado (503) não pode segurar o texto por minutos. */
export async function transcreverAudio(base64: string, mime: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    // Flash-Lite primeiro: responde em ~1 s e quase nunca está sobrecarregado; o Flash é reserva.
    for (const modelo of ["gemini-flash-lite-latest", "gemini-3.1-flash-lite", "gemini-flash-latest"]) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          signal: AbortSignal.timeout(12_000),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [
              { inline_data: { mime_type: mime.split(";")[0], data: base64 } },
              { text: "Transcreva fielmente este trecho de áudio em português do Brasil. Retorne só o texto falado, com pontuação, sem comentários. Se não houver fala, retorne vazio." },
            ] }],
            generationConfig: { temperature: 0, maxOutputTokens: 2048 },
          }),
        });
        if (!res.ok) { console.warn(`Gemini transcrição ${modelo} ${res.status}`); continue; }
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        const t = limparTranscricao(j.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "");
        // Resposta vazia com 200 = trecho só de silêncio; não vale a pena tentar outro modelo.
        return t;
      } catch (e) { console.warn(`Gemini transcrição ${modelo} falhou`, e); }
    }
  }
  const lk = process.env.LOVABLE_API_KEY;
  if (!lk) throw new Error("Transcrição não configurada.");
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  const form = new FormData();
  form.append("model", "openai/gpt-transcribe");
  form.append("file", new File([bin], `audio.${ext}`, { type: mime.split(";")[0] }));
  form.append("response_format", "json");
  form.append("language", "pt");
  form.append("stream", "true");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${lk}` },
    signal: AbortSignal.timeout(25_000),
    body: form,
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Muitas solicitações agora. Tente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    throw new Error(`Falha ao transcrever [${res.status}]`);
  }
  const corpo = await res.text();
  if (!corpo.includes("data:")) return limparTranscricao(String((JSON.parse(corpo) as { text?: string }).text ?? ""));
  let texto = "";
  let final = "";
  for (const l of corpo.split("\n")) {
    if (!l.startsWith("data:")) continue;
    const d = l.slice(5).trim();
    if (!d || d === "[DONE]") continue;
    try {
      const ev = JSON.parse(d) as { type?: string; delta?: string; text?: string };
      if (ev.type?.endsWith(".delta") && ev.delta) texto += ev.delta;
      if (ev.type?.endsWith(".done") && ev.text) final = ev.text;
    } catch { /* ignora */ }
  }
  return limparTranscricao(final || texto);
}

/** Remove marcações que os modelos devolvem para silêncio/ruído (ex.: "<noise>", "[silêncio]"). */
export function limparTranscricao(t: string): string {
  return t
    .replace(/<[^>]{1,20}>/g, " ")
    .replace(/\[(?:sil[eê]ncio|ru[ií]do|noise|silence|m[uú]sica|music|inaud[ií]vel)[^\]]{0,20}\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function chamarIA(memoria: string, instrucoes: string, entrada: string, nome: string, schema: Schema, validar?: (r: any) => boolean) {
  const viaGemini = await chamarGemini(`${PERSONA}\n${memoria}\n\n${instrucoes}`, entrada, schema, validar);
  if (viaGemini) return viaGemini;
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("IA não configurada.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions: `${PERSONA}\n${memoria}\n\n${instrucoes}`,
      input: entrada,
      text: { format: { type: "json_schema", name: nome, strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("Muitas solicitações agora. Tente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    throw new Error(`Falha na IA [${res.status}]: ${t.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let texto = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const linhas = buf.split("\n");
    buf = linhas.pop() ?? "";
    for (const l of linhas) {
      if (!l.startsWith("data:")) continue;
      const d = l.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d) as { type?: string; delta?: string; response?: { error?: { message?: string } } };
        if (ev.type === "response.output_text.delta" && ev.delta) texto += ev.delta;
        if (ev.type === "response.failed") throw new Error(ev.response?.error?.message ?? "IA falhou.");
      } catch (e) {
        if (e instanceof Error && e.message !== "Unexpected end of JSON input" && !(e instanceof SyntaxError)) throw e;
      }
    }
  }
  if (!texto.trim()) throw new Error("A IA não retornou resposta. Tente novamente.");
  return JSON.parse(texto);
}

type Ctx = { supabase: any; userId: string };
/** Memória própria: respostas/aulas anteriores do vendedor e respostas reais de clientes, para manter consistência. */
async function memoria(ctx: Ctx) {
  try {
    const [h, a] = await Promise.all([
      ctx.supabase.from("treinador_historico").select("tipo, titulo, resultado").eq("user_id", ctx.userId)
        .in("tipo", ["resposta", "aula"]).order("created_at", { ascending: false }).limit(15),
      ctx.supabase.from("hunter_abordagens").select("empresa, cargo, status, resposta_cliente, mensagens")
        .eq("user_id", ctx.userId).not("resposta_cliente", "is", null).order("respondido_em", { ascending: false }).limit(12),
    ]);
    const linhas: string[] = [];
    for (const i of h.data ?? []) {
      const r = i.resultado ?? {};
      linhas.push(i.tipo === "aula" ? `AULA JÁ DADA (${i.titulo}): ${String(r.resumo ?? "").slice(0, 300)}`
        : `RESPOSTA JÁ USADA (${i.titulo}): ${String(r.resposta ?? "").slice(0, 300)}`);
    }
    for (const x of a.data ?? []) {
      linhas.push(`CONVERSA REAL — ${x.empresa} (${x.cargo ?? "?"}, status ${x.status}). Enviamos: "${String(x.mensagens?.whatsapp ?? "").slice(0, 200)}". Cliente respondeu: "${String(x.resposta_cliente).slice(0, 300)}"`);
    }
    if (!linhas.length) return "";
    return `\n=== HISTÓRICO DO VENDEDOR (mantenha o mesmo estilo e conceitos; aprenda com o que gerou resposta) ===\n${linhas.join("\n")}\n=== FIM DO HISTÓRICO ===`;
  } catch {
    return "";
  }
}

const str = { type: "string" };
const arr = (items: Schema) => ({ type: "array", items });
const obj = (properties: Record<string, Schema>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

/* ---------- Respondendo o cliente ---------- */
export const responderCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mensagem: string; contexto: string; canal: "email" | "whatsapp"; esclarecimentos?: string }) => ({
    mensagem: String(d.mensagem ?? "").slice(0, 6000),
    contexto: String(d.contexto ?? "").slice(0, 6000),
    canal: d.canal === "email" ? ("email" as const) : ("whatsapp" as const),
    esclarecimentos: String(d.esclarecimentos ?? "").slice(0, 6000),
  }))
  .handler(async ({ data, context }) => {
    if (!data.mensagem.trim() && !data.contexto.trim()) throw new Error("Escreva o contexto da situação ou cole a mensagem do cliente.");
    const temMsg = !!data.mensagem.trim();
    const modo = temMsg
      ? `MODO: RESPONDER. O cliente ESCREVEU a mensagem abaixo. Você NÃO é o cliente e NÃO está respondendo ao vendedor:
você escreve a mensagem que o VENDEDOR vai enviar AO CLIENTE, reagindo ponto a ponto ao que o cliente disse.`
      : `MODO: INICIAR/CONDUZIR. Ainda NÃO há resposta do cliente. O vendedor descreveu uma situação e precisa da mensagem
que ele vai ENVIAR ao cliente agora (abrir, retomar, propor, cobrar retorno, contornar silêncio etc.).`;
    const r = (await chamarIA(
      await memoria(context),
      `Tarefa: você é o coach do vendedor Fellipe (G3 Expresso) e redige a próxima mensagem dele ao cliente pelo canal ${data.canal === "email" ? "E-MAIL (com assunto, 2 a 4 parágrafos bem construídos)" : "WHATSAPP (sem assunto, natural, de 4 a 10 linhas, pode quebrar em 2 balões)"}.
${modo}

Antes de escrever, RACIOCINE como um consultor sênior (não mostre o rascunho do raciocínio, só o resultado nos campos):
1. Leia TODO o contexto e a mensagem; identifique quem é o cliente, estágio da venda, o que ele realmente quer/teme, e o que está implícito.
2. Diagnostique a situação (objeção? tipo: preço, timing, confiança, concorrente, autoridade, silêncio, nenhuma).
3. Escolha UMA estratégia principal da base de conhecimento (SPIN, Voss, Challenger, Gap, Cialdini...) e justifique.
4. Escreva a mensagem usando detalhes CONCRETOS do contexto (nomes, rotas, cargas, números que o vendedor deu). Proibido texto genérico que serviria para qualquer cliente.
   Em primeira pessoa, humana, empática, terminando com uma pergunta ou próximo passo claro.
5. Se faltar informação importante para uma resposta precisa, ainda assim entregue a melhor versão possível e liste em "perguntas_para_vendedor"
   de 2 a 4 perguntas objetivas que, se respondidas, deixariam a mensagem mais certeira. Se nada faltar, deixe a lista vazia.
6. Explique em tópicos didáticos POR QUE funciona (técnica + livro), dê uma versão curta alternativa e o próximo passo após o envio.
Se houver ESCLARECIMENTOS DO VENDEDOR, eles são respostas às suas perguntas anteriores: incorpore-os e não repita essas perguntas.`,
      `${temMsg ? `MENSAGEM DO CLIENTE:\n${data.mensagem}\n\n` : "MENSAGEM DO CLIENTE: (ainda não há — o vendedor vai iniciar/conduzir)\n\n"}CONTEXTO DO VENDEDOR:\n${data.contexto || "(sem contexto)"}${data.esclarecimentos ? `\n\nESCLARECIMENTOS DO VENDEDOR:\n${data.esclarecimentos}` : ""}`,
      "resposta_cliente",
      obj({
        analise: str,
        estrategia: str,
        assunto: str,
        resposta: str,
        versao_curta: str,
        objecao: str,
        porques: arr(obj({ topico: str, explicacao: str, tecnica: str, livro: str })),
        proximo_passo: str,
        perguntas_para_vendedor: arr(str),
      }),
      (x) => String(x?.resposta ?? "").length >= (data.canal === "email" ? 450 : 220)
        && String(x?.analise ?? "").length >= 120 && Array.isArray(x?.porques) && x.porques.length >= 2,
    )) as {
      analise: string;
      estrategia: string;
      assunto: string;
      resposta: string;
      versao_curta: string;
      objecao: string;
      porques: { topico: string; explicacao: string; tecnica: string; livro: string }[];
      proximo_passo: string;
      perguntas_para_vendedor: string[];
    };
    await context.supabase.from("treinador_historico").insert({
      user_id: context.userId,
      tipo: "resposta",
      titulo: (r.objecao || data.mensagem || data.contexto).slice(0, 120),
      entrada: data,
      resultado: r,
    });
    return r;
  });

/* ---------- Transcrição de áudio (celular/app, onde o ditado do navegador não existe) ---------- */
export const transcreverContexto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { audio: string; mime: string }) => {
    const audio = String(d.audio ?? "");
    if (!audio || audio.length > 14_000_000) throw new Error("Áudio vazio ou muito longo (máx. ~10 MB).");
    const mime = String(d.mime ?? "audio/webm");
    if (!mime.startsWith("audio/")) throw new Error("Formato de áudio inválido.");
    return { audio, mime };
  })
  .handler(async ({ data }) => ({ texto: await transcreverAudio(data.audio, data.mime) }));

/* ---------- Abordagem para o Hunter (e-mail + WhatsApp) ---------- */
export const gerarAbordagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    empresa: string; contato: string; cargo: string; segmento: string; contexto: string;
    whatsapp?: string; email?: string; companyId?: string;
  }) => ({
    whatsapp: String(d.whatsapp ?? "").slice(0, 40),
    email: String(d.email ?? "").slice(0, 200),
    companyId: d.companyId ? String(d.companyId).slice(0, 100) : null,
    empresa: String(d.empresa ?? "").slice(0, 200),
    contato: String(d.contato ?? "").slice(0, 200),
    cargo: String(d.cargo ?? "").slice(0, 200),
    segmento: String(d.segmento ?? "").slice(0, 200),
    contexto: String(d.contexto ?? "").slice(0, 4000),
  }))
  .handler(async ({ data, context }) => {
    if (!data.empresa.trim()) throw new Error("Informe a empresa.");
    const r = (await chamarIA(
      await memoria(context),
      `Tarefa: criar abordagem de prospecção consultiva (ABM/social selling) para transporte de cargas.
Adapte o gancho à dor típica do cargo e do segmento (ex.: compras = custo total e previsibilidade; logística = SLA, avarias, agendamento de doca;
diretoria = risco e continuidade). Nada de pitch genérico: provoque uma reflexão (Venda Desafiadora) e peça um micro-sim, não uma reunião longa.
Gere: e-mail (assunto + corpo, até 120 palavras), mensagem de WhatsApp (até 5 linhas, informal-profissional) e um follow-up de WhatsApp para 3 dias depois.
Explique em tópicos por que a abordagem foi construída assim.`,
      `EMPRESA: ${data.empresa}\nCONTATO: ${data.contato || "?"}\nCARGO: ${data.cargo || "?"}\nSEGMENTO: ${data.segmento || "?"}\nCONTEXTO: ${data.contexto || "-"}`,
      "abordagem",
      obj({
        email_assunto: str,
        email_corpo: str,
        whatsapp: str,
        whatsapp_followup: str,
        porques: arr(obj({ topico: str, explicacao: str, livro: str })),
      }),
    )) as {
      email_assunto: string;
      email_corpo: string;
      whatsapp: string;
      whatsapp_followup: string;
      porques: { topico: string; explicacao: string; livro: string }[];
    };
    const { data: row } = await context.supabase
      .from("hunter_abordagens")
      .insert({
        user_id: context.userId,
        company_id: data.companyId,
        empresa: data.empresa,
        contato: data.contato || null,
        cargo: data.cargo || null,
        segmento: data.segmento || null,
        whatsapp: data.whatsapp || null,
        email: data.email || null,
        mensagens: r,
      })
      .select("id")
      .single();
    return { ...r, id: row?.id ?? null };
  });

/* ---------- Aula de livro (geral + transporte) ---------- */
export const aulaLivro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { livro: string; foco: string }) => ({
    livro: String(d.livro ?? "").slice(0, 200),
    foco: String(d.foco ?? "").slice(0, 1000),
  }))
  .handler(async ({ data, context }) => {
    if (!data.livro.trim()) throw new Error("Informe o livro.");
    const r = (await chamarIA(
      await memoria(context),
      `Tarefa: dar uma aula sobre o livro indicado em DUAS camadas:
1) Conhecimento GERAL e universal (aplicável a qualquer área, para o vendedor poder ensinar e ajudar outras pessoas e negócios).
2) Aplicação prática em TRANSPORTE rodoviário de cargas.
Inclua ideias-chave, exemplos em outras áreas (varejo, serviços, tecnologia, consultoria), exercício da semana, 3 perguntas de teste com resposta
e indique 2 livros complementares com o porquê.`,
      `LIVRO: ${data.livro}\nFOCO DESEJADO: ${data.foco || "visão completa"}`,
      "aula",
      obj({
        resumo: str,
        ideias_gerais: arr(obj({ ideia: str, explicacao: str })),
        exemplos_outras_areas: arr(obj({ area: str, exemplo: str })),
        aplicacao_transporte: arr(obj({ situacao: str, como_aplicar: str })),
        exercicio_semana: str,
        quiz: arr(obj({ pergunta: str, resposta: str })),
        proximas_leituras: arr(obj({ livro: str, motivo: str })),
      }),
    )) as {
      resumo: string;
      ideias_gerais: { ideia: string; explicacao: string }[];
      exemplos_outras_areas: { area: string; exemplo: string }[];
      aplicacao_transporte: { situacao: string; como_aplicar: string }[];
      exercicio_semana: string;
      quiz: { pergunta: string; resposta: string }[];
      proximas_leituras: { livro: string; motivo: string }[];
    };
    await context.supabase.from("treinador_historico").insert({
      user_id: context.userId,
      tipo: "aula",
      titulo: data.livro.slice(0, 200),
      entrada: data,
      resultado: r,
    });
    return r;
  });

/* ---------- Cartões de treino (flashcards) ---------- */
export const gerarCartoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { livro: string; foco: string }) => ({
    livro: String(d.livro ?? "").slice(0, 200),
    foco: String(d.foco ?? "").slice(0, 500),
  }))
  .handler(async ({ data, context }) => {
    if (!data.livro.trim()) throw new Error("Informe o livro.");
    const r = (await chamarIA(
      await memoria(context),
      `Tarefa: criar 10 cartões de memorização (flashcards) sobre o livro, misturando conceitos gerais e aplicação em transporte.
Cada cartão tem uma pergunta curta, 4 alternativas (apenas uma correta), o índice da correta (0 a 3) e uma explicação curta de por que é a correta.
Varie a posição da resposta correta.`,
      `LIVRO: ${data.livro}\nFOCO: ${data.foco || "conceitos principais"}`,
      "cartoes",
      obj({
        cartoes: arr(obj({ pergunta: str, alternativas: arr(str), correta: { type: "integer" }, explicacao: str })),
      }),
    )) as { cartoes: { pergunta: string; alternativas: string[]; correta: number; explicacao: string }[] };
    await context.supabase.from("treinador_historico").insert({
      user_id: context.userId,
      tipo: "cartoes",
      titulo: data.livro.slice(0, 200),
      entrada: data,
      resultado: r,
    });
    return r;
  });
