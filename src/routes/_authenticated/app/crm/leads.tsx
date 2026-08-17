import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, MailCheck, MailPlus, MessageCircle, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCrmLeads, type CrmLead } from "@/hooks/use-crm";
import { enviarLoteApresentacao } from "@/lib/hunter.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/app/crm/leads")({
  head: () => ({
    meta: [
      { title: "Leads pendentes — G3 Expresso" },
      {
        name: "description",
        content:
          "Leads do funil que ainda não receberam o e-mail de apresentação da G3 Expresso, com disparo em lote e contato direto por WhatsApp.",
      },
      { property: "og:title", content: "Leads pendentes — G3 Expresso" },
      {
        property: "og:description",
        content: "Dispare a apresentação em lote, sem repetição, e fale com o decisor pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadsPendentesPage,
});

/** Monta o link do WhatsApp com DDI 55 quando o número vem apenas com DDD. */
function linkWhatsapp(lead: CrmLead) {
  const bruto = (lead.whatsapp || lead.telefone || "").replace(/\D/g, "");
  if (bruto.length < 10) return null;
  const numero = bruto.length <= 11 ? `55${bruto}` : bruto;
  const nome = (lead.contato_nome ?? "").trim().split(/\s+/)[0] ?? "";
  const texto = `Olá${nome ? ` ${nome}` : ""}, aqui é a G3 Expresso. Podemos falar sobre a operação de transporte da ${lead.empresa}?`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function LeadsPendentesPage() {
  const qc = useQueryClient();
  const { data: leads = [], isPending } = useCrmLeads();
  const enviarLoteFn = useServerFn(enviarLoteApresentacao);

  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const enviados = useQuery({
    queryKey: ["crm-emails-enviados-destinatarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_emails_enviados")
        .select("destinatario, status")
        .eq("template", "apresentacao-g3")
        .eq("status", "enviado");
      if (error) throw error;
      return new Set((data ?? []).map((r) => (r.destinatario as string).toLowerCase()));
    },
  });

  const pendentes = useMemo(() => {
    const jaEnviados = enviados.data ?? new Set<string>();
    const q = busca.trim().toLowerCase();
    return leads.filter((l) => {
      if (!l.email) return false;
      if (jaEnviados.has(l.email.toLowerCase())) return false;
      if (!q) return true;
      return [l.empresa, l.contato_nome, l.email, l.cidade].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [leads, enviados.data, busca]);

  const lote = useMutation({
    mutationFn: (leadIds: string[]) => enviarLoteFn({ data: { leadIds } }),
    onSuccess: (r) => {
      setSelecionados([]);
      qc.invalidateQueries({ queryKey: ["crm-emails-enviados-destinatarios"] });
      qc.invalidateQueries({ queryKey: ["crm-emails-enviados"] });
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      toast.success(`${r.enviados} e-mail(s) enviado(s)`, {
        description: `${r.ignorados} ignorado(s) por duplicidade · ${r.falhas} falha(s).`,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const todosMarcados = pendentes.length > 0 && selecionados.length === pendentes.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
          <MailPlus className="size-5 text-brand" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Leads pendentes</h1>
          <p className="text-sm text-muted-foreground">
            Leads com e-mail cadastrado que ainda não receberam a apresentação da G3. O disparo em lote nunca repete um
            destinatário já contatado.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por empresa, contato, e-mail ou cidade"
            className="max-w-sm"
          />
          <Badge variant="outline">{pendentes.length} pendente(s)</Badge>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelecionados(todosMarcados ? [] : pendentes.map((l) => l.id))}
              disabled={pendentes.length === 0}
            >
              {todosMarcados ? "Limpar seleção" : "Selecionar todos"}
            </Button>
            <Button
              size="sm"
              disabled={selecionados.length === 0 || lote.isPending}
              onClick={() => lote.mutate(selecionados)}
            >
              {lote.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              Enviar lote ({selecionados.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      {(isPending || enviados.isPending) && <Skeleton className="h-40 w-full" />}

      {!isPending && !enviados.isPending && pendentes.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <MailCheck className="size-4 text-brand" />
            Nenhum lead pendente — todos os contatos com e-mail já receberam a apresentação.
          </CardContent>
        </Card>
      )}

      {pendentes.length > 0 && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {pendentes.map((l) => {
            const wa = linkWhatsapp(l);
            const marcado = selecionados.includes(l.id);
            return (
              <div key={l.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <Checkbox
                  checked={marcado}
                  onCheckedChange={(v) =>
                    setSelecionados((prev) => (v ? [...prev, l.id] : prev.filter((id) => id !== l.id)))
                  }
                  aria-label={`Selecionar ${l.empresa}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{l.empresa}</div>
                  <div className="truncate text-muted-foreground">
                    {l.contato_nome ? `${l.contato_nome}${l.cargo ? ` · ${l.cargo}` : ""} · ` : ""}
                    {l.email}
                    {l.cidade ? ` · ${l.cidade}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {wa ? (
                    <Button asChild size="sm" variant="outline">
                      <a href={wa} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="mr-2 size-4" /> WhatsApp
                      </a>
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-[10px] font-normal">
                      sem telefone
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={lote.isPending}
                    onClick={() => lote.mutate([l.id])}
                  >
                    <Mail className="mr-2 size-4" /> Enviar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
