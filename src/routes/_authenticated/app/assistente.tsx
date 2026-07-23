import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Send, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/_authenticated/app/assistente")({
  head: () => ({ meta: [{ title: "Assistente IA — G3 Expresso" }] }),
  component: AssistentePage,
});

type Msg = { role: "user" | "assistant"; content: string };

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const SUGESTOES = [
  "Qual meu saldo projetado neste mês?",
  "Quais os 3 maiores clientes por receita?",
  "Há alguma conta atrasada crítica?",
  "Como está a performance dos motoristas?",
];

function AssistentePage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Snapshot de dados para contexto do modelo
  const { data: contexto } = useQuery({
    queryKey: ["assistente-contexto"],
    queryFn: async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 90);
      const desdeStr = desde.toISOString().slice(0, 10);

      const [lanc, viag, cli] = await Promise.all([
        supabase
          .from("financeiro_lancamentos")
          .select("tipo, valor, status, data_vencimento, categoria, descricao")
          .gte("data_vencimento", desdeStr),
        supabase
          .from("viagens")
          .select("status, valor_frete, km_inicial, km_final, data_saida, data_chegada")
          .gte("created_at", desdeStr),
        supabase.from("clientes").select("razao_social, ativo").eq("ativo", true),
      ]);

      const l = lanc.data ?? [];
      const v = viag.data ?? [];
      const receitas = l.filter((x) => x.tipo === "receber").reduce((s, x) => s + Number(x.valor), 0);
      const despesas = l.filter((x) => x.tipo === "pagar").reduce((s, x) => s + Number(x.valor), 0);
      const atrasadoReceber = l
        .filter((x) => x.tipo === "receber" && x.status === "atrasado")
        .reduce((s, x) => s + Number(x.valor), 0);
      const atrasadoPagar = l
        .filter((x) => x.tipo === "pagar" && x.status === "atrasado")
        .reduce((s, x) => s + Number(x.valor), 0);
      const pendReceber = l
        .filter((x) => x.tipo === "receber" && x.status === "pendente")
        .reduce((s, x) => s + Number(x.valor), 0);
      const pendPagar = l
        .filter((x) => x.tipo === "pagar" && x.status === "pendente")
        .reduce((s, x) => s + Number(x.valor), 0);

      const catDespesas = new Map<string, number>();
      for (const x of l) {
        if (x.tipo !== "pagar") continue;
        const c = x.categoria || "Outros";
        catDespesas.set(c, (catDespesas.get(c) ?? 0) + Number(x.valor));
      }
      const topCat = Array.from(catDespesas.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const viagensConcluidas = v.filter((x) => x.status === "concluida").length;
      const viagensAndamento = v.filter((x) => x.status === "em_andamento").length;
      const kmTotal = v.reduce((s, x) => s + Math.max(0, (x.km_final ?? 0) - (x.km_inicial ?? 0)), 0);
      const freteTotal = v.reduce((s, x) => s + Number(x.valor_frete ?? 0), 0);

      const proximosVenc = l
        .filter((x) => x.status !== "pago" && x.status !== "cancelado" && x.data_vencimento)
        .sort((a, b) => (a.data_vencimento ?? "").localeCompare(b.data_vencimento ?? ""))
        .slice(0, 8)
        .map(
          (x) =>
            `${x.tipo === "receber" ? "Receber" : "Pagar"} ${fmtBRL(Number(x.valor))} em ${x.data_vencimento ?? "sem vencimento"} (${x.status}) — ${x.descricao}`,
        )
        .join("\n");

      return [
        `Período analisado: últimos 90 dias.`,
        `Total de clientes ativos: ${cli.data?.length ?? 0}`,
        ``,
        `FINANCEIRO:`,
        `- Receitas totais (previstas + realizadas): ${fmtBRL(receitas)}`,
        `- Despesas totais: ${fmtBRL(despesas)}`,
        `- Saldo projetado: ${fmtBRL(receitas - despesas)}`,
        `- A receber pendente: ${fmtBRL(pendReceber)} | atrasado: ${fmtBRL(atrasadoReceber)}`,
        `- A pagar pendente: ${fmtBRL(pendPagar)} | atrasado: ${fmtBRL(atrasadoPagar)}`,
        `- Top categorias de despesa:`,
        ...topCat.map(([c, val]) => `  · ${c}: ${fmtBRL(val)}`),
        ``,
        `OPERACIONAL:`,
        `- Viagens (90d): ${v.length} total, ${viagensConcluidas} concluídas, ${viagensAndamento} em andamento`,
        `- Km rodados: ${kmTotal.toLocaleString("pt-BR")}`,
        `- Frete total: ${fmtBRL(freteTotal)}`,
        ``,
        `PRÓXIMOS 8 VENCIMENTOS:`,
        proximosVenc || "(nenhum)",
      ].join("\n");
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const enviar = async (texto?: string) => {
    const conteudo = (texto ?? input).trim();
    if (!conteudo || loading) return;
    const nova: Msg[] = [...messages, { role: "user", content: conteudo }];
    setMessages(nova);
    setInput("");
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        setMessages((m) => m.slice(0, -1));
        setInput(conteudo);
        return;
      }
      const resp = await fetch("/api/assistente", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: nova, contexto }),
      });
      const data = (await resp.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!resp.ok) {
        toast.error(data.error || "Erro ao consultar assistente");
        setMessages((m) => m.slice(0, -1));
        setInput(conteudo);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply || "(sem resposta)" }]);
    } catch (e) {
      toast.error("Falha de conexão com o assistente");
      setMessages((m) => m.slice(0, -1));
      setInput(conteudo);
    } finally {
      setLoading(false);
    }
  };

  const empty = useMemo(() => messages.length === 0, [messages]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b border-border/60 px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
            <Sparkles className="size-5 text-brand" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">Assistente IA</h1>
            <p className="text-xs text-muted-foreground">Analisa seus dados operacionais e financeiros em tempo real</p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-4xl space-y-4">
          {empty && (
            <Card className="p-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="size-4 text-brand" />
                Comece com uma sugestão ou faça sua pergunta:
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    onClick={() => enviar(s)}
                    className="rounded-lg border border-border/60 bg-card px-3 py-2 text-left text-sm transition-colors hover:border-brand hover:bg-brand-subtle"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-subtle">
                  <Logo variant="mark" size="sm" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-brand text-brand-foreground"
                    : "bg-card border border-border/60"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-headings:my-2">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
              {m.role === "user" && (
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                  <User className="size-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Analisando...
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border/60 bg-background px-4 py-3 md:px-8">
        <div className="mx-auto flex max-w-4xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder="Pergunte sobre finanças, viagens, motoristas..."
            className="min-h-11 resize-none"
            rows={1}
            disabled={loading}
          />
          <Button onClick={() => enviar()} disabled={loading || !input.trim()} size="icon">
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-4xl text-center text-[10px] text-muted-foreground">
          Respostas geradas por IA com base em dados dos últimos 90 dias. Verifique informações críticas.
        </p>
      </div>
    </div>
  );
}
