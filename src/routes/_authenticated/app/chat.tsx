import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { enviarChatMotorista } from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/app/chat")({
  head: () => ({
    meta: [
      { title: "Chat do motorista — G3 Expresso" },
      { name: "description", content: "Converse com a G3 ou com o monitor do cliente pelo WhatsApp." },
    ],
  }),
  component: ChatMotorista,
});

const hora = (d: string) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function ChatMotorista() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enviarFn = useServerFn(enviarChatMotorista);
  const [destino, setDestino] = useState<string>("g3"); // "g3" ou id do contato
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const { data: motoristaId } = useQuery({
    queryKey: ["chat-motorista-id", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("id").eq("user_id", user!.id).maybeSingle();
      return data?.id ?? null;
    },
  });

  // RLS devolve só monitores do cliente da viagem ativa.
  const { data: monitores = [] } = useQuery({
    queryKey: ["chat-monitores", motoristaId],
    enabled: !!motoristaId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("cliente_contatos_whatsapp").select("id, nome, cargo").eq("ativo", true);
      return data ?? [];
    },
  });

  const key = ["chat-mensagens", motoristaId];
  const { data: msgs = [] } = useQuery({
    queryKey: key,
    enabled: !!motoristaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("motorista_chat_mensagens")
        .select("*")
        .eq("motorista_id", motoristaId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).reverse();
    },
  });

  useEffect(() => {
    if (!motoristaId) return;
    const ch = supabase
      .channel(`chat-${motoristaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "motorista_chat_mensagens", filter: `motorista_id=eq.${motoristaId}` },
        () => qc.invalidateQueries({ queryKey: ["chat-mensagens", motoristaId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [motoristaId, qc]);

  const visiveis = msgs.filter((m) => (destino === "g3" ? m.destino === "g3" : m.contato_id === destino));
  useEffect(() => fimRef.current?.scrollIntoView({ block: "end" }), [visiveis.length]);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      const r = await enviarFn({
        data: destino === "g3" ? { destino: "g3", texto } : { destino: "monitor", contatoId: destino, texto },
      });
      if (r.erro) toast.warning("Mensagem salva, mas o WhatsApp não confirmou o envio", { description: r.erro.slice(0, 160) });
      setTexto("");
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error("Não foi possível enviar", { description: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-14rem)] flex-col gap-3 p-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={destino === "g3" ? "default" : "outline"} onClick={() => setDestino("g3")}>
          G3 (interno)
        </Button>
        {monitores.map((m) => (
          <Button key={m.id} size="sm" variant={destino === m.id ? "default" : "outline"} onClick={() => setDestino(m.id)}>
            {m.nome}
            {m.cargo ? ` · ${m.cargo}` : ""}
          </Button>
        ))}
        {monitores.length === 0 && (
          <span className="self-center text-xs text-muted-foreground">Monitores do cliente aparecem durante a viagem.</span>
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border bg-muted/30 p-3">
        {visiveis.length === 0 && <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>}
        {visiveis.map((m) => {
          const meu = m.autor === "motorista";
          return (
            <div key={m.id} className={cn("flex", meu ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-lg px-3 py-2 text-sm", meu ? "bg-primary text-primary-foreground" : "bg-card border")}>
                {!meu && <div className="text-xs font-semibold">{m.contato_nome ?? "G3"}</div>}
                <div className="whitespace-pre-wrap break-words">{m.texto}</div>
                <div className="mt-1 text-[10px] opacity-70">
                  {hora(m.created_at)}
                  {meu && m.envio_erro ? " · não entregue" : ""}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>
      <div className="flex gap-2">
        <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva sua mensagem" className="flex-1" />
        <Button className="h-auto" onClick={enviar} disabled={enviando || !texto.trim()} aria-label="Enviar">
          {enviando ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
        </Button>
      </div>
    </div>
  );
}
