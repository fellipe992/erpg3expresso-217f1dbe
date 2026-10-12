import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/app/crm/carteira")({
  head: () => ({
    meta: [
      { title: "Minha carteira | G3 Expresso" },
      { name: "description", content: "Carteira de clientes com histórico de abordagens e conversas." },
      { property: "og:title", content: "Minha carteira | G3 Expresso" },
      { property: "og:description", content: "Veja quem já respondeu e o histórico de cada cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, string> = { em_abordagem: "Em abordagem", resposta_pendente: "Respondeu", convertido: "Convertido", perdido: "Sem interesse" };
const dh = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");
const norm = (s: string) => s.trim().toUpperCase();

type Ab = { id: string; empresa: string; contato: string | null; status: string; created_at: string; enviado_em: string | null;
  canal_envio: string | null; resposta_cliente: string | null; respondido_em: string | null; cliente_id: string | null; mensagens: any };

function Page() {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "respondeu" | "sem">("todos");
  const [sel, setSel] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["carteira"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "";
      const [c, a] = await Promise.all([
        supabase.from("hunter_clientes").select("id, empresa, segmento, tipo_frete, contato, telefone, email").eq("user_id", uid).limit(1000),
        supabase.from("hunter_abordagens").select("id, empresa, contato, status, created_at, enviado_em, canal_envio, resposta_cliente, respondido_em, cliente_id, mensagens")
          .eq("user_id", uid).order("created_at", { ascending: false }).limit(2000),
      ]);
      if (c.error) throw c.error;
      if (a.error) throw a.error;
      return { clientes: c.data, abs: a.data as Ab[] };
    },
  });

  const carteira = useMemo(() => {
    const m = new Map<string, { chave: string; empresa: string; segmento?: string | null; tipo_frete?: string | null; contato?: string | null; abs: Ab[] }>();
    for (const c of q.data?.clientes ?? []) m.set(c.id, { chave: c.id, empresa: c.empresa, segmento: c.segmento, tipo_frete: c.tipo_frete, contato: c.contato, abs: [] });
    const porNome = new Map([...m.values()].map((v) => [norm(v.empresa), v.chave]));
    for (const a of q.data?.abs ?? []) {
      const k = (a.cliente_id && m.has(a.cliente_id) ? a.cliente_id : porNome.get(norm(a.empresa))) ?? `n:${norm(a.empresa)}`;
      if (!m.has(k)) { m.set(k, { chave: k, empresa: a.empresa, contato: a.contato, abs: [] }); porNome.set(norm(a.empresa), k); }
      m.get(k)!.abs.push(a);
    }
    return [...m.values()].map((v) => {
      const respondeu = v.abs.some((a) => a.resposta_cliente || a.status === "resposta_pendente" || a.status === "convertido");
      const ultima = v.abs[0];
      return { ...v, respondeu, ultima };
    }).sort((x, y) => (y.ultima?.created_at ?? "").localeCompare(x.ultima?.created_at ?? ""));
  }, [q.data]);

  const lista = carteira.filter((c) => (filtro === "todos" || (filtro === "respondeu" ? c.respondeu : !c.respondeu))
    && (!busca || c.empresa.toLowerCase().includes(busca.toLowerCase())));
  const atual = carteira.find((c) => c.chave === sel);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Minha carteira</h1>
          <p className="text-sm text-muted-foreground">{carteira.length} clientes · {carteira.filter((c) => c.respondeu).length} já responderam</p></div>
        <Button asChild variant="outline"><Link to="/app/crm/clientes-hunter">Cadastrar cliente</Link></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar empresa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {(["todos", "respondeu", "sem"] as const).map((f) => (
          <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>
            {f === "todos" ? "Todos" : f === "respondeu" ? "Já responderam" : "Sem resposta"}
          </Button>
        ))}
      </div>
      {q.isLoading && <Loader2 className="size-5 animate-spin" />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="divide-y rounded-md border">
          {lista.map((c) => (
            <button key={c.chave} onClick={() => setSel(c.chave)} className={`flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50 ${sel === c.chave ? "bg-muted" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.empresa}</p>
                <p className="truncate text-xs text-muted-foreground">{[c.segmento, c.tipo_frete, c.contato].filter(Boolean).join(" · ") || "—"}</p>
                <p className="text-[11px] text-muted-foreground">{c.abs.length} abordagens · última {dh(c.ultima?.created_at ?? null)}</p>
              </div>
              {c.respondeu ? <Badge>Respondeu</Badge> : <Badge variant="outline">Aguardando</Badge>}
            </button>
          ))}
          {!q.isLoading && lista.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum cliente.</p>}
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">{atual ? atual.empresa : "Selecione um cliente"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {atual?.abs.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem abordagens.</p>}
            {atual?.abs.map((a) => (
              <div key={a.id} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{STATUS[a.status] ?? a.status}</Badge>
                  <span>Gerada {dh(a.created_at)}</span><span>· Enviada {dh(a.enviado_em)}</span>{a.canal_envio && <span>· {a.canal_envio}</span>}
                </div>
                <div className="ml-auto max-w-[90%] rounded-lg bg-primary/10 p-2 text-sm whitespace-pre-wrap"><b className="text-xs">Você:</b> {a.mensagens?.whatsapp ?? a.mensagens?.email_corpo}</div>
                {a.resposta_cliente
                  ? <div className="max-w-[90%] rounded-lg bg-muted p-2 text-sm whitespace-pre-wrap"><b className="text-xs">Cliente ({dh(a.respondido_em)}):</b> {a.resposta_cliente}</div>
                  : <p className="text-xs text-muted-foreground">Sem resposta registrada. Registre em Acompanhamento.</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
