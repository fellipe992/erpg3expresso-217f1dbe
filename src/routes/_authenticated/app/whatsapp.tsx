import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { responderMotorista } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/app/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp — G3 Expresso" },
      { name: "description", content: "Números internos, histórico de avisos e chat com motoristas." },
    ],
  }),
  component: WhatsAppPage,
});

const hora = (d: string) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const STATUS: Record<string, string> = {
  accepted: "Enviada",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  received: "Recebida",
};

function WhatsAppPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="font-display text-2xl font-bold">WhatsApp</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Internos />
        <ChatsMotoristas />
      </div>
      <Historico />
    </div>
  );
}

function Internos() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["wa-internos"],
    queryFn: async () => (await supabase.from("whatsapp_contatos_internos").select("*").order("nome")).data ?? [],
  });
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const add = async () => {
    const d = tel.replace(/\D/g, "");
    if (!nome.trim() || d.length < 10) return toast.error("Informe nome e WhatsApp com DDD");
    const { error } = await supabase
      .from("whatsapp_contatos_internos")
      .insert({ nome: nome.trim().toUpperCase(), telefone: d.length <= 11 ? `55${d}` : d });
    if (error) return toast.error(error.message);
    setNome("");
    setTel("");
    qc.invalidateQueries({ queryKey: ["wa-internos"] });
  };
  const del = async (id: string) => {
    await supabase.from("whatsapp_contatos_internos").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["wa-internos"] });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Números internos da G3</CardTitle>
        <p className="text-xs text-muted-foreground">Recebem todos os avisos e as mensagens do chat "G3" dos motoristas.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
            <span>
              {i.nome} · +{i.telefone}
            </span>
            <Button variant="ghost" size="icon" onClick={() => del(i.id)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-32 flex-1" placeholder="NOME" value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} />
          <Input className="min-w-32 flex-1" placeholder="WhatsApp com DDD" value={tel} onChange={(e) => setTel(e.target.value)} />
          <Button onClick={add}>
            <Plus className="size-4" /> Adicionar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ChatsMotoristas() {
  const qc = useQueryClient();
  const responder = useServerFn(responderMotorista);
  const [sel, setSel] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { data: msgs = [] } = useQuery({
    queryKey: ["wa-chats"],
    refetchInterval: 20_000,
    queryFn: async () =>
      (await supabase.from("motorista_chat_mensagens").select("*").order("created_at", { ascending: false }).limit(300)).data ?? [],
  });
  const { data: nomes = {} } = useQuery({
    queryKey: ["wa-chat-nomes"],
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("id, nome");
      return Object.fromEntries((data ?? []).map((m) => [m.id, m.nome])) as Record<string, string>;
    },
  });
  useEffect(() => {
    const ch = supabase
      .channel("wa-chats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "motorista_chat_mensagens" }, () =>
        qc.invalidateQueries({ queryKey: ["wa-chats"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);
  const motoristas = [...new Set(msgs.map((m) => m.motorista_id))];
  const conversa = msgs.filter((m) => m.motorista_id === sel).reverse();
  const enviar = async () => {
    if (!sel || !texto.trim()) return;
    setEnviando(true);
    try {
      await responder({ data: { motoristaId: sel, texto } });
      setTexto("");
      qc.invalidateQueries({ queryKey: ["wa-chats"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chat com motoristas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {motoristas.length === 0 && <span className="text-sm text-muted-foreground">Nenhuma conversa ainda.</span>}
          {motoristas.map((id) => (
            <Button key={id} size="sm" variant={sel === id ? "default" : "outline"} onClick={() => setSel(id)}>
              {nomes[id] ?? "Motorista"}
            </Button>
          ))}
        </div>
        {sel && (
          <>
            <div className="max-h-80 space-y-2 overflow-y-auto rounded border bg-muted/30 p-2">
              {conversa.map((m) => (
                <div key={m.id} className={cn("flex", m.autor === "motorista" ? "justify-start" : "justify-end")}>
                  <div className="max-w-[85%] rounded-lg border bg-card px-3 py-1.5 text-sm">
                    <div className="text-[10px] text-muted-foreground">
                      {m.autor === "motorista" ? `Motorista → ${m.contato_nome ?? "G3"}` : m.contato_nome} · {hora(m.created_at)}
                    </div>
                    <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} className="flex-1" placeholder="Responder ao motorista" />
              <Button className="h-auto" onClick={enviar} disabled={enviando}>
                {enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Historico() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["wa-historico"],
    refetchInterval: 30_000,
    queryFn: async () =>
      (await supabase.from("whatsapp_mensagens").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico de mensagens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <Loader2 className="size-4 animate-spin" />}
        {data.map((m) => (
          <div key={m.id} className="rounded border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{m.direcao === "saida" ? "Enviada para" : "Recebida de"} +{m.telefone}</span>
              <span>{hora(m.created_at)}</span>
              {m.evento && <Badge variant="outline">{m.evento}</Badge>}
              <Badge variant={m.status === "failed" ? "destructive" : "secondary"}>{STATUS[m.status] ?? m.status}</Badge>
            </div>
            <div className="whitespace-pre-wrap break-words">{m.texto}</div>
            {m.erro && <div className="mt-1 break-all text-xs text-destructive">{m.erro.slice(0, 300)}</div>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
