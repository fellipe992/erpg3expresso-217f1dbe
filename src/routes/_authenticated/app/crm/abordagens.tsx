import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MessageCircle, Reply, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/crm/abordagens")({
  head: () => ({
    meta: [
      { title: "Acompanhamento de abordagens | G3 Expresso" },
      { name: "description", content: "Leads em abordagem, respostas pendentes e convertidos do Hunter." },
      { property: "og:title", content: "Acompanhamento de abordagens | G3 Expresso" },
      { property: "og:description", content: "Acompanhe o que já foi enviado pelo Hunter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AbordagensPage,
});

type Row = {
  id: string;
  empresa: string;
  contato: string | null;
  cargo: string | null;
  whatsapp: string | null;
  email: string | null;
  status: string;
  enviado_em: string | null;
  observacao: string | null;
  mensagens: any;
  resposta_cliente: string | null;
  respondido_em: string | null;
  updated_at: string;
};

const COLUNAS = [
  { id: "em_abordagem", titulo: "Em abordagem", desc: "Mensagem gerada ou enviada, aguardando o cliente" },
  { id: "resposta_pendente", titulo: "Resposta pendente", desc: "O cliente respondeu e você precisa responder" },
  { id: "convertido", titulo: "Convertidos", desc: "Viraram oportunidade ou cliente" },
  { id: "perdido", titulo: "Sem interesse", desc: "Descartados" },
] as const;

const dt = (s: string) => new Date(s).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function waLink(texto: string, numero?: string | null) {
  const n = (numero ?? "").replace(/\D/g, "");
  const full = n && n.length <= 11 ? `55${n}` : n;
  return `https://wa.me/${full}?text=${encodeURIComponent(texto)}`;
}

function AbordagensPage() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<Row | null>(null);
  const [obs, setObs] = useState("");
  const [resp, setResp] = useState("");
  const q = useQuery({
    queryKey: ["hunter-abordagens"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("hunter_abordagens")
        .select("id, empresa, contato, cargo, whatsapp, email, status, enviado_em, observacao, mensagens, updated_at, resposta_cliente, respondido_em")
        .eq("user_id", u.user?.id ?? "")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Row[];
    },
  });

  const atualizar = async (id: string, patch: Partial<Row>) => {
    const { error } = await supabase.from("hunter_abordagens").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["hunter-abordagens"] });
  };
  const excluir = async (id: string) => {
    const { error } = await supabase.from("hunter_abordagens").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setAberto(null);
    qc.invalidateQueries({ queryKey: ["hunter-abordagens"] });
  };

  const rows = q.data ?? [];
  const enviados = rows.filter((r) => r.enviado_em).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Acompanhamento de abordagens</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} abordagens · {enviados} enviadas · {rows.filter((r) => r.status === "convertido").length} convertidas
          </p>
        </div>
        <Button asChild variant="outline"><Link to="/app/crm/hunter">Abrir Hunter</Link></Button>
      </div>
      {q.isLoading && <Loader2 className="size-5 animate-spin" />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUNAS.map((c) => {
          const itens = rows.filter((r) => r.status === c.id);
          return (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  {c.titulo} <Badge variant="secondary">{itens.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">{c.desc}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {itens.map((r) => (
                  <button key={r.id} onClick={() => { setAberto(r); setObs(r.observacao ?? ""); setResp(r.resposta_cliente ?? ""); }}
                    className="w-full rounded-md border p-2.5 text-left hover:bg-muted/50">
                    <p className="truncate text-sm font-medium">{r.empresa}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[r.contato, r.cargo].filter(Boolean).join(" · ") || "Contato geral"}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {r.enviado_em ? `Enviada em ${dt(r.enviado_em)}` : "Ainda não enviada"}
                    </p>
                  </button>
                ))}
                {itens.length === 0 && <p className="text-xs text-muted-foreground">Nada aqui.</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {aberto && (
            <>
              <DialogHeader><DialogTitle>{aberto.empresa}</DialogTitle></DialogHeader>
              <div className="flex flex-wrap gap-1.5">
                {COLUNAS.map((c) => (
                  <Button key={c.id} size="sm" variant={aberto.status === c.id ? "default" : "outline"}
                    onClick={() => { atualizar(aberto.id, { status: c.id }); setAberto({ ...aberto, status: c.id }); }}>
                    {c.titulo}
                  </Button>
                ))}
              </div>
              {!aberto.enviado_em && (
                <Button size="sm" variant="secondary" onClick={() => {
                  const agora = new Date().toISOString();
                  atualizar(aberto.id, { enviado_em: agora });
                  setAberto({ ...aberto, enviado_em: agora });
                }}>Marcar como enviada</Button>
              )}
              {[
                ["E-mail", `${aberto.mensagens?.email_assunto ?? ""}\n\n${aberto.mensagens?.email_corpo ?? ""}`],
                ["WhatsApp", aberto.mensagens?.whatsapp ?? ""],
                ["Follow-up (3 dias)", aberto.mensagens?.whatsapp_followup ?? ""],
              ].map(([t, v]) => (
                <div key={t} className="rounded-md border bg-muted/40 p-3">
                  <div className="mb-1 flex items-center gap-1">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">{t}</span>
                    <Button size="sm" variant="ghost" className="ml-auto h-6 px-2"
                      onClick={() => navigator.clipboard.writeText(v!).then(() => toast.success("Copiado!"))}>
                      <Copy className="size-3" />
                    </Button>
                    {t !== "E-mail" && (
                      <Button size="sm" variant="ghost" className="h-6 px-2" asChild>
                        <a href={waLink(v!, aberto.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle className="size-3" /></a>
                      </Button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{v}</p>
                </div>
              ))}
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Resposta do cliente</p>
                <Textarea rows={3} value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Cole aqui o que o cliente respondeu"
                  onBlur={() => {
                    if (resp === (aberto.resposta_cliente ?? "")) return;
                    const patch: Partial<Row> = { resposta_cliente: resp, respondido_em: new Date().toISOString() };
                    if (resp && aberto.status === "em_abordagem") patch.status = "resposta_pendente";
                    atualizar(aberto.id, patch);
                    setAberto({ ...aberto, ...patch });
                  }} />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Anotações</p>
                <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)}
                  onBlur={() => obs !== (aberto.observacao ?? "") && atualizar(aberto.id, { observacao: obs })} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm"><Link to="/app/crm/treinador"><Reply className="mr-1.5 size-3.5" /> Responder com o Treinador</Link></Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => excluir(aberto.id)}>
                  <Trash2 className="mr-1.5 size-3.5" /> Excluir
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
