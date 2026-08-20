import { useQuery } from "@tanstack/react-query";
import { Loader2, MailCheck, MailX, MessageCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Envio = {
  id: string;
  empresa: string;
  contato_nome: string | null;
  destinatario: string;
  status: string;
  detalhe: string | null;
  created_at: string;
  lead_id: string | null;
};

type Lead = { id: string; email: string | null; telefone: string | null; whatsapp: string | null; cargo: string | null };

function linkWhatsapp(numeroBruto: string | null, empresa: string) {
  const bruto = (numeroBruto ?? "").replace(/\D/g, "");
  if (bruto.length < 10) return null;
  const numero = bruto.length <= 11 ? `55${bruto}` : bruto;
  const texto = `Olá! Aqui é a G3 Expresso. Podemos falar sobre a operação de transporte da ${empresa}?`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/**
 * Relatório de pessoas contactadas por e-mail em uma EMPRESA (card do funil).
 * O título da oportunidade é o nome da empresa — é a chave usada aqui.
 */
export function ContatosEmpresa({ empresa }: { empresa: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["crm-contatos-empresa", empresa],
    queryFn: async () => {
      const [envios, leads] = await Promise.all([
        supabase
          .from("crm_emails_enviados")
          .select("id, empresa, contato_nome, destinatario, status, detalhe, created_at, lead_id")
          .eq("empresa", empresa)
          .order("created_at", { ascending: false }),
        supabase.from("crm_leads").select("id, email, telefone, whatsapp, cargo").eq("empresa", empresa),
      ]);
      if (envios.error) throw envios.error;
      if (leads.error) throw leads.error;
      return { envios: (envios.data ?? []) as Envio[], leads: (leads.data ?? []) as Lead[] };
    },
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center p-6">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }

  const envios = data?.envios ?? [];
  const leads = data?.leads ?? [];

  return (
    <div className="space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Pessoas contactadas por e-mail ({envios.length})
      </div>

      {envios.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nenhum e-mail enviado para esta empresa ainda.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-md border">
          {envios.map((e) => {
            const lead = leads.find((l) => l.id === e.lead_id || l.email === e.destinatario);
            const wa = linkWhatsapp(lead?.whatsapp ?? lead?.telefone ?? null, empresa);
            const ok = e.status === "enviado";
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {e.contato_nome?.trim() || e.destinatario}
                    {lead?.cargo ? <span className="text-muted-foreground"> · {lead.cargo}</span> : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {e.destinatario} · {new Date(e.created_at).toLocaleString("pt-BR")}
                    {!ok && e.detalhe ? ` · ${e.detalhe}` : ""}
                  </div>
                </div>
                <Badge variant={ok ? "default" : "destructive"} className="shrink-0 text-[10px] font-normal">
                  {ok ? (
                    <MailCheck className="mr-1 size-3" />
                  ) : (
                    <MailX className="mr-1 size-3" />
                  )}
                  {ok ? "e-mail enviado" : "falhou"}
                </Badge>
                {wa && (
                  <Button asChild size="sm" variant="outline" className="h-7 shrink-0 text-xs">
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="mr-1.5 size-3.5" /> WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
