import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Mail, MessageCircle, Mic, MicOff, Sparkles, BookOpen, Reply, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { aulaLivro, gerarAbordagem, responderCliente } from "@/lib/treinador.functions";

export const Route = createFileRoute("/_authenticated/app/crm/treinador")({
  head: () => ({
    meta: [
      { title: "Treinador de Vendas | G3 Expresso" },
      { name: "description", content: "Respostas a clientes, abordagens de e-mail e WhatsApp e aulas de vendas." },
      { property: "og:title", content: "Treinador de Vendas | G3 Expresso" },
      { property: "og:description", content: "Treinamento comercial com IA voltado a transporte e vendas em geral." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TreinadorPage,
});

const LIVROS = [
  "Alcançando a Excelência em Vendas (SPIN Selling) — Neil Rackham",
  "Receita Previsível — Aaron Ross e Marylou Tyler",
  "As Armas da Persuasão — Robert Cialdini",
  "A Venda Desafiadora — Matthew Dixon e Brent Adamson",
  "A Bíblia de Vendas — Jeffrey Gitomer",
  "Como Fazer Amigos e Influenciar Pessoas — Dale Carnegie",
  "Negocie como se sua vida dependesse disso — Chris Voss",
  "Gap Selling — Keenan",
  "Prospecção Fanática — Jeb Blount",
];

function copiar(t: string) {
  navigator.clipboard.writeText(t).then(() => toast.success("Copiado!"));
}

function waLink(texto: string, numero?: string) {
  const n = (numero ?? "").replace(/\D/g, "");
  const full = n && n.length <= 11 ? `55${n}` : n;
  return `https://wa.me/${full}?text=${encodeURIComponent(texto)}`;
}

/** Ditado por voz (navegador). Acrescenta o texto falado ao campo. */
function useDitado(onTexto: (t: string) => void) {
  const [ouvindo, setOuvindo] = useState(false);
  const ref = useRef<any>(null);
  const alternar = () => {
    if (ouvindo) {
      ref.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Ditado por voz não suportado neste navegador. Use o Chrome.");
      return;
    }
    const r = new SR();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e: any) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t) onTexto(t.trim());
    };
    r.onend = () => setOuvindo(false);
    r.onerror = () => setOuvindo(false);
    ref.current = r;
    r.start();
    setOuvindo(true);
  };
  return { ouvindo, alternar };
}

function BotaoVoz({ onTexto }: { onTexto: (t: string) => void }) {
  const { ouvindo, alternar } = useDitado(onTexto);
  return (
    <Button type="button" size="sm" variant={ouvindo ? "destructive" : "outline"} onClick={alternar}>
      {ouvindo ? <MicOff className="mr-1.5 size-3.5" /> : <Mic className="mr-1.5 size-3.5" />}
      {ouvindo ? "Parar áudio" : "Falar contexto"}
    </Button>
  );
}

function BlocoTexto({ titulo, texto, whatsapp }: { titulo: string; texto: string; whatsapp?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{titulo}</span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => copiar(texto)}>
            <Copy className="size-3.5" />
          </Button>
          {whatsapp && (
            <Button size="sm" variant="ghost" asChild>
              <a href={waLink(texto)} target="_blank" rel="noreferrer">
                <MessageCircle className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm">{texto}</p>
    </div>
  );
}

function Porques({ itens }: { itens: { topico: string; explicacao: string; livro: string; tecnica?: string }[] }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Por que essa resposta funciona</p>
      {itens.map((p, i) => (
        <div key={i} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{p.topico}</span>
            {p.tecnica && <Badge variant="secondary">{p.tecnica}</Badge>}
            {p.livro && <Badge variant="outline">{p.livro}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{p.explicacao}</p>
        </div>
      ))}
    </div>
  );
}

function RespondendoCliente() {
  const fn = useServerFn(responderCliente);
  const [mensagem, setMensagem] = useState("");
  const [contexto, setContexto] = useState("");
  const [canal, setCanal] = useState<"email" | "whatsapp">("whatsapp");
  const m = useMutation({
    mutationFn: () => fn({ data: { mensagem, contexto, canal } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const r = m.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Reply className="size-5" /> Respondendo o cliente</CardTitle>
          <CardDescription>Cole a mensagem do cliente, explique o contexto (escrevendo ou falando) e receba uma resposta humana.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant={canal === "whatsapp" ? "default" : "outline"} onClick={() => setCanal("whatsapp")}>
              <MessageCircle className="mr-1.5 size-3.5" /> WhatsApp
            </Button>
            <Button size="sm" variant={canal === "email" ? "default" : "outline"} onClick={() => setCanal("email")}>
              <Mail className="mr-1.5 size-3.5" /> E-mail
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem do cliente</Label>
            <Textarea rows={6} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Ex.: Achei o valor alto, a transportadora atual cobra 12% menos..." />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Contexto (quem é, histórico, o que você quer)</Label>
              <BotaoVoz onTexto={(t) => setContexto((c) => (c ? `${c} ${t}` : t))} />
            </div>
            <Textarea rows={5} value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Ex.: Comprador de indústria de alimentos, já fizemos 2 cotações, quero fechar um teste de 1 carga..." />
          </div>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !mensagem.trim()} className="w-full">
            {m.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            Me ajude a responder
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Sugestão</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!r && <p className="text-sm text-muted-foreground">A resposta aparece aqui.</p>}
          {r && (
            <>
              {r.objecao && <Badge>Objeção: {r.objecao}</Badge>}
              {canal === "email" && r.assunto && <BlocoTexto titulo="Assunto" texto={r.assunto} />}
              <BlocoTexto titulo="Resposta" texto={r.resposta} whatsapp={canal === "whatsapp"} />
              <BlocoTexto titulo="Versão curta" texto={r.versao_curta} whatsapp={canal === "whatsapp"} />
              <Porques itens={r.porques} />
              <div className="rounded-md bg-primary/10 p-3 text-sm"><b>Próximo passo:</b> {r.proximo_passo}</div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Abordagem() {
  const fn = useServerFn(gerarAbordagem);
  const [f, setF] = useState({ empresa: "", contato: "", cargo: "", segmento: "", contexto: "", whatsapp: "" });
  const m = useMutation({
    mutationFn: () => fn({ data: f }),
    onError: (e: Error) => toast.error(e.message),
  });
  const r = m.data;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: k === "contexto" || k === "whatsapp" ? e.target.value : e.target.value.toUpperCase() }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Crosshair className="size-5" /> Abordagem para o Hunter</CardTitle>
          <CardDescription>Gera e-mail, WhatsApp e follow-up personalizados pelo cargo e segmento.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Empresa</Label><Input value={f.empresa} onChange={set("empresa")} /></div>
          <div className="space-y-1.5"><Label>Contato</Label><Input value={f.contato} onChange={set("contato")} /></div>
          <div className="space-y-1.5"><Label>Cargo</Label><Input value={f.cargo} onChange={set("cargo")} /></div>
          <div className="space-y-1.5"><Label>Segmento</Label><Input value={f.segmento} onChange={set("segmento")} placeholder="ALIMENTOS, E-COMMERCE..." /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>WhatsApp do contato (opcional)</Label><Input value={f.whatsapp} onChange={set("whatsapp")} placeholder="(11) 99999-9999" /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>O que você sabe sobre eles</Label>
              <BotaoVoz onTexto={(t) => setF((s) => ({ ...s, contexto: s.contexto ? `${s.contexto} ${t}` : t }))} />
            </div>
            <Textarea rows={4} value={f.contexto} onChange={set("contexto")} placeholder="Ex.: abriram novo CD em Cajamar, postaram vaga de analista de transportes..." />
          </div>
          <Button className="sm:col-span-2" onClick={() => m.mutate()} disabled={m.isPending || !f.empresa.trim()}>
            {m.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            Gerar abordagem
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Mensagens</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!r && <p className="text-sm text-muted-foreground">As mensagens aparecem aqui.</p>}
          {r && (
            <>
              <BlocoTexto titulo="E-mail — assunto" texto={r.email_assunto} />
              <BlocoTexto titulo="E-mail — corpo" texto={r.email_corpo} />
              <div className="rounded-lg border bg-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">WhatsApp</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copiar(r.whatsapp)}><Copy className="size-3.5" /></Button>
                    <Button size="sm" asChild>
                      <a href={waLink(r.whatsapp, f.whatsapp)} target="_blank" rel="noreferrer">
                        <MessageCircle className="mr-1.5 size-3.5" /> Abrir no WhatsApp
                      </a>
                    </Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm">{r.whatsapp}</p>
              </div>
              <BlocoTexto titulo="Follow-up (3 dias depois)" texto={r.whatsapp_followup} whatsapp />
              <Porques itens={r.porques} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Biblioteca() {
  const fn = useServerFn(aulaLivro);
  const [livro, setLivro] = useState(LIVROS[0]!);
  const [foco, setFoco] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { livro, foco } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const r = m.data;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="size-5" /> Biblioteca e aula da semana</CardTitle>
          <CardDescription>Cada aula traz o conhecimento geral do livro (para qualquer área) e a aplicação em transporte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {LIVROS.map((l) => (
              <Button key={l} size="sm" variant={l === livro ? "default" : "outline"} onClick={() => setLivro(l)}>
                {l.split(" — ")[0]}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Ou digite outro livro</Label><Input value={livro} onChange={(e) => setLivro(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Foco (opcional)</Label><Input value={foco} onChange={(e) => setFoco(e.target.value)} placeholder="Ex.: lidar com objeção de preço" /></div>
          </div>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !livro.trim()}>
            {m.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            Gerar aula
          </Button>
        </CardContent>
      </Card>
      {r && (
        <Card>
          <CardContent className="space-y-5 pt-6">
            <p className="text-sm">{r.resumo}</p>
            <section className="space-y-2">
              <h3 className="font-semibold">Conhecimento geral</h3>
              {r.ideias_gerais.map((i, k) => (
                <div key={k} className="rounded-md border p-3"><b className="text-sm">{i.ideia}</b><p className="text-sm text-muted-foreground">{i.explicacao}</p></div>
              ))}
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">Em outras áreas</h3>
              {r.exemplos_outras_areas.map((i, k) => (
                <p key={k} className="text-sm"><Badge variant="outline" className="mr-2">{i.area}</Badge>{i.exemplo}</p>
              ))}
            </section>
            <section className="space-y-2">
              <h3 className="font-semibold">No transporte</h3>
              {r.aplicacao_transporte.map((i, k) => (
                <div key={k} className="rounded-md border p-3"><b className="text-sm">{i.situacao}</b><p className="text-sm text-muted-foreground">{i.como_aplicar}</p></div>
              ))}
            </section>
            <div className="rounded-md bg-primary/10 p-3 text-sm"><b>Exercício da semana:</b> {r.exercicio_semana}</div>
            <section>
              <h3 className="mb-2 font-semibold">Teste rápido</h3>
              <Accordion type="multiple">
                {r.quiz.map((q, k) => (
                  <AccordionItem key={k} value={String(k)}>
                    <AccordionTrigger className="text-left text-sm">{q.pergunta}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{q.resposta}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
            <section className="space-y-1">
              <h3 className="font-semibold">Próximas leituras</h3>
              {r.proximas_leituras.map((p, k) => (
                <p key={k} className="text-sm"><b>{p.livro}:</b> {p.motivo}</p>
              ))}
            </section>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TreinadorPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Treinador de Vendas</h1>
        <p className="text-sm text-muted-foreground">Responda clientes, crie abordagens para o Hunter e aprenda com os melhores livros de vendas.</p>
      </div>
      <Tabs defaultValue="responder">
        <TabsList className="flex-wrap">
          <TabsTrigger value="responder">Respondendo o cliente</TabsTrigger>
          <TabsTrigger value="abordagem">Abordagem e-mail / WhatsApp</TabsTrigger>
          <TabsTrigger value="biblioteca">Biblioteca</TabsTrigger>
        </TabsList>
        <TabsContent value="responder"><RespondendoCliente /></TabsContent>
        <TabsContent value="abordagem"><Abordagem /></TabsContent>
        <TabsContent value="biblioteca"><Biblioteca /></TabsContent>
      </Tabs>
    </div>
  );
}
