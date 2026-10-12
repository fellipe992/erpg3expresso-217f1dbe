import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/crm/abordagens-equipe")({
  head: () => ({
    meta: [
      { title: "Abordagens da equipe | G3 Expresso" },
      { name: "description", content: "Todas as abordagens enviadas pelos comerciais, com status e respostas." },
      { property: "og:title", content: "Abordagens da equipe | G3 Expresso" },
      { property: "og:description", content: "Acompanhe tudo o que sai do Hunter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, string> = {
  em_abordagem: "Em abordagem", resposta_pendente: "Respondeu", convertido: "Convertido", perdido: "Sem interesse",
};
const dh = (s: string | null) =>
  s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

type Row = {
  id: string; user_id: string; empresa: string; contato: string | null; cargo: string | null; status: string;
  created_at: string; enviado_em: string | null; canal_envio: string | null; resposta_cliente: string | null;
  respondido_em: string | null; observacao: string | null; mensagens: any;
};

function Page() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [comercial, setComercial] = useState("todos");
  const [aberto, setAberto] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["abordagens-equipe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hunter_abordagens")
        .select("id, user_id, empresa, contato, cargo, status, created_at, enviado_em, canal_envio, resposta_cliente, respondido_em, observacao, mensagens")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const ids = [...new Set(data.map((d) => d.user_id))];
      const { data: perfis } = ids.length ? await supabase.from("profiles").select("id, nome, email").in("id", ids) : { data: [] };
      const nomes = new Map((perfis ?? []).map((p) => [p.id, p.nome || p.email || "—"]));
      return { rows: data as Row[], nomes };
    },
  });
  const rows = q.data?.rows ?? [];
  const nomes = q.data?.nomes ?? new Map<string, string>();
  const filtrados = useMemo(() => rows.filter((r) =>
    (status === "todos" || r.status === status) &&
    (comercial === "todos" || r.user_id === comercial) &&
    (!busca || `${r.empresa} ${r.contato ?? ""}`.toLowerCase().includes(busca.toLowerCase()))), [rows, status, comercial, busca]);

  const enviadas = rows.filter((r) => r.enviado_em).length;
  const respondidas = rows.filter((r) => r.resposta_cliente || r.status === "resposta_pendente" || r.status === "convertido").length;
  const kpis = [
    ["Geradas", rows.length], ["Enviadas", enviadas], ["Respondidas", respondidas],
    ["Convertidas", rows.filter((r) => r.status === "convertido").length],
    ["Taxa de resposta", enviadas ? `${Math.round((respondidas / enviadas) * 100)}%` : "—"],
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Abordagens da equipe</h1>
        <p className="text-sm text-muted-foreground">Tudo o que saiu do Hunter, por comercial, com data, hora, status e resposta.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map(([t, v]) => (
          <Card key={t as string}><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{t}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{v}</p></CardContent></Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar empresa ou contato" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={comercial} onValueChange={setComercial}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos os comerciais</SelectItem>
            {[...nomes.entries()].map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {q.isLoading && <Loader2 className="size-5 animate-spin" />}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-2">Gerada</th><th className="p-2">Comercial</th><th className="p-2">Empresa / contato</th>
              <th className="p-2">Enviada</th><th className="p-2">Canal</th><th className="p-2">Status</th><th className="p-2">Resposta</th></tr>
          </thead>
          <tbody>
            {filtrados.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setAberto(r)}>
                <td className="whitespace-nowrap p-2">{dh(r.created_at)}</td>
                <td className="p-2">{nomes.get(r.user_id) ?? "—"}</td>
                <td className="p-2"><b>{r.empresa}</b><div className="text-xs text-muted-foreground">{[r.contato, r.cargo].filter(Boolean).join(" · ")}</div></td>
                <td className="whitespace-nowrap p-2">{dh(r.enviado_em)}</td>
                <td className="p-2 capitalize">{r.canal_envio ?? "—"}</td>
                <td className="p-2"><Badge variant="secondary">{STATUS[r.status] ?? r.status}</Badge></td>
                <td className="max-w-xs truncate p-2 text-xs">{r.resposta_cliente ?? "—"}</td>
              </tr>
            ))}
            {!q.isLoading && filtrados.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Nenhuma abordagem.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {aberto && (<>
            <DialogHeader><DialogTitle>{aberto.empresa}</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">Comercial: {nomes.get(aberto.user_id)} · Gerada {dh(aberto.created_at)} · Enviada {dh(aberto.enviado_em)}</p>
            {[["E-mail", `${aberto.mensagens?.email_assunto ?? ""}\n\n${aberto.mensagens?.email_corpo ?? ""}`],
              ["WhatsApp", aberto.mensagens?.whatsapp ?? ""], ["Follow-up", aberto.mensagens?.whatsapp_followup ?? ""]].map(([t, v]) => (
              <div key={t} className="rounded-md border bg-muted/40 p-3"><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{t}</p><p className="whitespace-pre-wrap text-sm">{v}</p></div>
            ))}
            <div className="rounded-md border p-3"><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Resposta do cliente {aberto.respondido_em && `· ${dh(aberto.respondido_em)}`}</p>
              <p className="whitespace-pre-wrap text-sm">{aberto.resposta_cliente || "Sem resposta registrada."}</p></div>
            {aberto.observacao && <p className="text-sm"><b>Anotações:</b> {aberto.observacao}</p>}
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
