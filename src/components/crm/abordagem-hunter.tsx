import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, Mail, MessageCircle, RefreshCw, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { gerarAbordagem } from "@/lib/treinador.functions";

type Msgs = {
  email_assunto: string;
  email_corpo: string;
  whatsapp: string;
  whatsapp_followup: string;
  porques?: { topico: string; explicacao: string; livro: string }[];
};
type Decisor = { nome: string; cargo: string | null; email: string | null; telefone: string | null };
type Empresa = { id: string; nome: string; segmento: string | null; telefone: string | null; cidade: string | null };

function waLink(texto: string, numero?: string | null) {
  const n = (numero ?? "").replace(/\D/g, "");
  const full = n && n.length <= 11 ? `55${n}` : n;
  return `https://wa.me/${full}?text=${encodeURIComponent(texto)}`;
}

export function AbordagemHunter({ empresa, decisores }: { empresa: Empresa; decisores: Decisor[] }) {
  const fn = useServerFn(gerarAbordagem);
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState<Decisor | null>(null);
  const [msgs, setMsgs] = useState<Msgs | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const iniciado = useRef<string | null>(null);

  const gerar = async (d: Decisor | null) => {
    setCarregando(true);
    try {
      const r = await fn({
        data: {
          empresa: empresa.nome,
          contato: d?.nome ?? "",
          cargo: d?.cargo ?? "",
          segmento: empresa.segmento ?? "",
          contexto: empresa.cidade ? `Empresa localizada em ${empresa.cidade}.` : "",
          whatsapp: d?.telefone ?? empresa.telefone ?? "",
          email: d?.email ?? "",
          companyId: empresa.id,
        },
      });
      setMsgs(r);
      setRowId(r.id);
      setEnviado(false);
      qc.invalidateQueries({ queryKey: ["hunter-abordagens"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregando(false);
    }
  };

  // Ao abrir a empresa: reaproveita a última abordagem salva ou gera uma nova automaticamente.
  useEffect(() => {
    if (iniciado.current === empresa.id) return;
    iniciado.current = empresa.id;
    setMsgs(null);
    setRowId(null);
    (async () => {
      const { data } = await supabase
        .from("hunter_abordagens")
        .select("id, mensagens, enviado_em")
        .eq("company_id", empresa.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setMsgs(data.mensagens as unknown as Msgs);
        setRowId(data.id);
        setEnviado(!!data.enviado_em);
      } else {
        gerar(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa.id]);

  const marcarEnviado = async (canal?: string) => {
    if (!rowId || enviado) return;
    const { error } = await supabase
      .from("hunter_abordagens")
      .update({ enviado_em: new Date().toISOString(), status: "em_abordagem", canal_envio: canal ?? "manual" })
      .eq("id", rowId);
    if (error) return toast.error(error.message);
    setEnviado(true);
    qc.invalidateQueries({ queryKey: ["hunter-abordagens"] });
    toast.success("Envio registrado com data e hora.");
  };

  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado!"));
  const numero = alvo?.telefone ?? empresa.telefone;

  return (
    <div className="space-y-3 rounded-lg border border-brand/40 bg-brand/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-brand" />
        <span className="text-sm font-semibold">Abordagem pronta</span>
        {enviado && <Badge variant="secondary">Enviada</Badge>}
        <Link to="/app/crm/abordagens" className="ml-auto text-xs text-muted-foreground underline">
          Acompanhamento
        </Link>
      </div>

      {decisores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={!alvo ? "default" : "outline"} className="h-7 text-xs" disabled={carregando}
            onClick={() => { setAlvo(null); gerar(null); }}>
            Empresa
          </Button>
          {decisores.slice(0, 6).map((d) => (
            <Button key={d.nome} size="sm" variant={alvo?.nome === d.nome ? "default" : "outline"} className="h-7 text-xs"
              disabled={carregando} onClick={() => { setAlvo(d); gerar(d); }}>
              {d.nome.split(" ")[0]}{d.cargo ? ` · ${d.cargo.slice(0, 18)}` : ""}
            </Button>
          ))}
        </div>
      )}

      {carregando && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Escrevendo abordagem e follow-up...
        </p>
      )}

      {!carregando && msgs && (
        <div className="space-y-2">
          {[
            { t: "E-mail", v: `${msgs.email_assunto}\n\n${msgs.email_corpo}`, wa: false },
            { t: "WhatsApp", v: msgs.whatsapp, wa: true },
            { t: "Follow-up (3 dias)", v: msgs.whatsapp_followup, wa: true },
          ].map((b) => (
            <div key={b.t} className="rounded-md border bg-background p-2.5">
              <div className="mb-1 flex items-center gap-1">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground">{b.t}</span>
                <Button size="sm" variant="ghost" className="ml-auto h-6 px-2" onClick={() => copiar(b.v)}>
                  <Copy className="size-3" />
                </Button>
                {b.wa ? (
                  <Button size="sm" variant="ghost" className="h-6 px-2" asChild>
                    <a href={waLink(b.v, numero)} target="_blank" rel="noreferrer" onClick={() => marcarEnviado("whatsapp")}><MessageCircle className="size-3" /></a>
                  </Button>
                ) : (
                  alvo?.email && (
                    <Button size="sm" variant="ghost" className="h-6 px-2" asChild>
                      <a onClick={() => marcarEnviado("email")} href={`mailto:${alvo.email}?subject=${encodeURIComponent(msgs.email_assunto)}&body=${encodeURIComponent(msgs.email_corpo)}`}>
                        <Mail className="size-3" />
                      </a>
                    </Button>
                  )
                )}
              </div>
              <p className="whitespace-pre-wrap text-xs">{b.v}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => gerar(alvo)}>
              <RefreshCw className="mr-1.5 size-3.5" /> Gerar outra
            </Button>
            <Button size="sm" onClick={() => marcarEnviado()} disabled={enviado || !rowId}>
              <Send className="mr-1.5 size-3.5" /> {enviado ? "Enviada" : "Marcar como enviada"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
