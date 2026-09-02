import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, MailCheck, MessageCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { enviarLoteApresentacao } from "@/lib/hunter.functions";
import {
  ORIGENS_LEAD,
  SEGMENTOS,
  useUsuariosInternos,
  type CrmLead,
} from "@/hooks/use-crm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const empty: Partial<CrmLead> = { prioridade: "media", classificacao: "B", status: "aberto", etiquetas: [] };

/** Link de WhatsApp com a apresentação curta da G3 (DDI 55 quando vem só com DDD). */
function linkWhatsapp(telefone: string, empresa: string) {
  const bruto = telefone.replace(/\D/g, "");
  if (bruto.length < 10) return null;
  const numero = bruto.length <= 11 ? `55${bruto}` : bruto;
  const texto = `Olá! Aqui é a G3 Expresso, transportadora rodoviária de cargas. Podemos falar sobre a operação de transporte da ${empresa}?`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function LeadDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Partial<CrmLead> | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: usuarios = [] } = useUsuariosInternos();
  const [form, setForm] = useState<Partial<CrmLead>>(empty);

  useEffect(() => {
    if (open) setForm(lead && lead.id ? lead : { ...empty, responsavel_id: user?.id ?? null });
  }, [open, lead, user?.id]);

  const enviarLoteFn = useServerFn(enviarLoteApresentacao);

  const save = useMutation({
    mutationFn: async (acao: "nada" | "email" | "whatsapp") => {
      if (!form.empresa?.trim()) throw new Error("Empresa / Nome do lead é obrigatório");
      const email = (form.email ?? "").trim();
      const zap = (form.whatsapp || form.telefone || "").trim();
      if (acao === "email" && !email) throw new Error("Informe o e-mail do lead para enviar a apresentação");
      if (acao === "whatsapp" && !zap) throw new Error("Informe o WhatsApp (ou telefone) do lead");

      const payload = {
        empresa: form.empresa.trim(),
        contato_nome: form.contato_nome || null,
        cargo: form.cargo || null,
        telefone: form.telefone || null,
        whatsapp: form.whatsapp || null,
        email: email || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
        segmento: form.segmento || null,
        origem: form.origem || null,
        cnpj_cpf: form.cnpj_cpf || null,
        responsavel_id: form.responsavel_id || null,
        potencial_faturamento: form.potencial_faturamento ? Number(form.potencial_faturamento) : null,
        classificacao: form.classificacao || null,
        prioridade: form.prioridade || "media",
        observacoes: form.observacoes || null,
        etiquetas: form.etiquetas ?? [],
        proximo_contato: form.proximo_contato || null,
      };

      let leadId = form.id as string | undefined;
      if (leadId) {
        const { error } = await supabase.from("crm_leads").update(payload).eq("id", leadId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("crm_leads")
          .insert({ ...payload, created_by: user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        leadId = data.id as string;
      }

      if (acao === "email" && leadId) {
        const r = (await enviarLoteFn({ data: { leadIds: [leadId] } })) as {
          enviados: number;
          invalidos: number;
          falhas: number;
          ignorados: number;
        };
        return { acao, enviados: r.enviados, ignorados: r.ignorados, invalidos: r.invalidos, falhas: r.falhas };
      }

      if (acao === "whatsapp") {
        const url = linkWhatsapp(zap, form.empresa.trim());
        if (!url) throw new Error("Número de WhatsApp inválido");
        window.open(url, "_blank", "noopener,noreferrer");
      }

      return { acao };
    },
    onSuccess: (res) => {
      toast.success(form.id ? "Lead atualizado" : "Lead cadastrado");
      if (res.acao === "email") {
        if (res.enviados) toast.success("Apresentação enviada por e-mail");
        else
          toast.error("Não foi possível enviar", {
            description: `${res.ignorados ?? 0} já contatado(s) · ${res.invalidos ?? 0} inválido(s) · ${res.falhas ?? 0} falha(s).`,
          });
      }
      qc.invalidateQueries({ queryKey: ["crm-leads"] });
      qc.invalidateQueries({ queryKey: ["hunter-emails-enviados"] });
      qc.invalidateQueries({ queryKey: ["crm-timeline"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const etiquetasTexto = (form.etiquetas ?? []).join(", ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar lead" : "Novo lead"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <F label="Empresa / Nome *">
              <Input value={form.empresa ?? ""} onChange={(e) => setForm({ ...form, empresa: e.target.value })} />
            </F>
          </div>
          <F label="CNPJ / CPF">
            <Input value={form.cnpj_cpf ?? ""} onChange={(e) => setForm({ ...form, cnpj_cpf: e.target.value })} />
          </F>
          <F label="Contato">
            <Input value={form.contato_nome ?? ""} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} />
          </F>
          <F label="Cargo">
            <Input value={form.cargo ?? ""} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
          </F>
          <F label="Telefone">
            <Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </F>
          <F label="WhatsApp">
            <Input value={form.whatsapp ?? ""} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          </F>
          <F label="E-mail">
            <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </F>
          <F label="Cidade">
            <Input value={form.cidade ?? ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
          </F>
          <F label="UF">
            <Input maxLength={2} value={form.uf ?? ""} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} />
          </F>
          <F label="Segmento">
            <Select value={form.segmento ?? ""} onValueChange={(v) => setForm({ ...form, segmento: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {SEGMENTOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Origem">
            <Select value={form.origem ?? ""} onValueChange={(v) => setForm({ ...form, origem: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ORIGENS_LEAD.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Responsável">
            <Select value={form.responsavel_id ?? ""} onValueChange={(v) => setForm({ ...form, responsavel_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Potencial de faturamento (R$/mês)">
            <DecimalInput
              decimais={2}
              value={form.potencial_faturamento ?? ""}
              onChange={(v) => setForm({ ...form, potencial_faturamento: v === "" ? null : Number(v) })}
            />
          </F>
          <F label="Classificação">
            <Select value={form.classificacao ?? "B"} onValueChange={(v) => setForm({ ...form, classificacao: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A — alto potencial</SelectItem>
                <SelectItem value="B">B — médio potencial</SelectItem>
                <SelectItem value="C">C — baixo potencial</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Prioridade">
            <Select value={form.prioridade ?? "media"} onValueChange={(v) => setForm({ ...form, prioridade: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Próximo contato">
            <Input
              type="datetime-local"
              value={form.proximo_contato ? String(form.proximo_contato).slice(0, 16) : ""}
              onChange={(e) => setForm({ ...form, proximo_contato: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </F>
          <div className="md:col-span-2">
            <F label="Etiquetas (separadas por vírgula)">
              <Input
                value={etiquetasTexto}
                onChange={(e) =>
                  setForm({ ...form, etiquetas: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
                }
              />
            </F>
          </div>
          <div className="md:col-span-2">
            <F label="Observações">
              <Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </F>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
