import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Phone,
  Sparkles,
  UserPlus,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCrmTimeline } from "@/hooks/use-crm";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TIPOS = [
  { value: "nota", label: "Nota", icon: MessageSquare },
  { value: "ligacao", label: "Ligação", icon: Phone },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "email", label: "E-mail", icon: MessageSquare },
  { value: "reuniao", label: "Reunião", icon: CalendarClock },
  { value: "visita", label: "Visita", icon: CalendarClock },
];

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  lead_criado: UserPlus,
  lead_convertido: CheckCircle2,
  oportunidade_criada: Sparkles,
  etapa_alterada: CalendarClock,
  negocio_ganho: CheckCircle2,
  negocio_perdido: XCircle,
  ligacao: Phone,
  reuniao: CalendarClock,
  visita: CalendarClock,
};

export function CrmTimeline({
  leadId,
  oportunidadeId,
  clienteId,
}: {
  leadId?: string;
  oportunidadeId?: string;
  clienteId?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: itens = [], isLoading } = useCrmTimeline({ leadId, oportunidadeId, clienteId });
  const [tipo, setTipo] = useState("nota");
  const [texto, setTexto] = useState("");

  const registrar = useMutation({
    mutationFn: async () => {
      if (!texto.trim()) throw new Error("Escreva o registro da interação");
      const label = TIPOS.find((t) => t.value === tipo)?.label ?? "Nota";
      const { error } = await supabase.from("crm_atividades").insert({
        tipo,
        titulo: label,
        descricao: texto.trim(),
        lead_id: leadId ?? null,
        oportunidade_id: oportunidadeId ?? null,
        cliente_id: clienteId ?? null,
        usuario_id: user?.id ?? null,
      });
      if (error) throw error;
      if (leadId) {
        await supabase.from("crm_leads").update({ ultimo_contato: new Date().toISOString() }).eq("id", leadId);
      }
    },
    onSuccess: () => {
      setTexto("");
      toast.success("Interação registrada");
      qc.invalidateQueries({ queryKey: ["crm-timeline"] });
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex gap-2">
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => registrar.mutate()} disabled={registrar.isPending} className="ml-auto">
            {registrar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Registrar
          </Button>
        </div>
        <Textarea
          rows={2}
          placeholder="O que aconteceu nesta interação?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid place-items-center p-6"><Loader2 className="size-5 animate-spin text-brand" /></div>
      ) : itens.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma interação registrada ainda.</p>
      ) : (
        <ol className="relative space-y-4 border-l pl-6">
          {itens.map((a) => {
            const Icon = ICONES[a.tipo] ?? MessageSquare;
            return (
              <li key={a.id} className="relative">
                <span className="absolute -left-[31px] grid size-6 place-items-center rounded-full border bg-background">
                  <Icon className="size-3 text-brand" />
                </span>
                <div className="text-sm font-medium">{a.titulo}</div>
                {a.descricao && <div className="text-sm text-muted-foreground">{a.descricao}</div>}
                <div className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("pt-BR")}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
