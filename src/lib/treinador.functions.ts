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

/** Gemini (chave própria, franquia gratuita do Google). Retorna null se indisponível, para cair no fallback. */
async function chamarGemini(sistema: string, entrada: string, schema: Schema) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const modelo of ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [{ role: "user", parts: [{ text: entrada }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, temperature: 0.6 },
        }),
      });
      if (!res.ok) { console.warn(`Gemini ${modelo} ${res.status}`); continue; }
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (t.trim()) return JSON.parse(t);
    } catch (e) { console.warn(`Gemini ${modelo} falhou`, e); }
  }
  return null;
}

async function chamarIA(memoria: string, instrucoes: string, entrada: string, nome: string, schema: Schema) {
  const viaGemini = await chamarGemini(`${PERSONA}\n${memoria}\n\n${instrucoes}`, entrada, schema);
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
  .inputValidator((d: { mensagem: string; contexto: string; canal: "email" | "whatsapp" }) => ({
    mensagem: String(d.mensagem ?? "").slice(0, 6000),
    contexto: String(d.contexto ?? "").slice(0, 6000),
    canal: d.canal === "email" ? ("email" as const) : ("whatsapp" as const),
  }))
  .handler(async ({ data, context }) => {
    if (!data.mensagem.trim()) throw new Error("Cole a mensagem do cliente.");
    const r = (await chamarIA(
      await memoria(context),
      `Tarefa: ajudar o vendedor a responder um cliente/prospect pelo canal ${data.canal === "email" ? "E-MAIL (inclua assunto)" : "WHATSAPP (curto, sem assunto, até ~6 linhas)"}.
Escreva a resposta como se fosse o próprio vendedor (Fellipe) falando, em primeira pessoa, humana e empática.
Identifique se há objeção e o tipo. Depois explique, em tópicos didáticos, POR QUE essa resposta funciona, citando a técnica e o livro de origem,
para que o vendedor aprenda. Dê também uma versão alternativa mais curta e o próximo passo recomendado.`,
      `MENSAGEM DO CLIENTE:\n${data.mensagem}\n\nCONTEXTO DO VENDEDOR:\n${data.contexto || "(sem contexto)"}`,
      "resposta_cliente",
      obj({
        assunto: str,
        resposta: str,
        versao_curta: str,
        objecao: str,
        porques: arr(obj({ topico: str, explicacao: str, tecnica: str, livro: str })),
        proximo_passo: str,
      }),
    )) as {
      assunto: string;
      resposta: string;
      versao_curta: string;
      objecao: string;
      porques: { topico: string; explicacao: string; tecnica: string; livro: string }[];
      proximo_passo: string;
    };
    await context.supabase.from("treinador_historico").insert({
      user_id: context.userId,
      tipo: "resposta",
      titulo: (r.objecao || data.mensagem).slice(0, 120),
      entrada: data,
      resultado: r,
    });
    return r;
  });

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
