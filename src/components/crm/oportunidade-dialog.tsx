import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  ORIGENS_LEAD,
  useClientesSimples,
  useCrmEtapas,
  useUsuariosInternos,
  type CrmOportunidade,
} from "@/hooks/use-crm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function OportunidadeDialog({
  open,
  onOpenChange,
  oportunidade,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  oportunidade: Partial<CrmOportunidade> | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: etapas = [] } = useCrmEtapas();
  const { data: usuarios = [] } = useUsuariosInternos();
  const { data: clientes = [] } = useClientesSimples();
  const [form, setForm] = useState<Partial<CrmOportunidade>>({});

  useEffect(() => {
    if (!open) return;
    if (oportunidade?.id) setForm(oportunidade);
    else
      setForm({
        probabilidade: 50,
        valor_estimado: 0,
        responsavel_id: user?.id ?? null,
        etapa_id: etapas[0]?.id,
        ...oportunidade,
      });
  }, [open, oportunidade, user?.id, etapas]);

  const etapaAtual = etapas.find((e) => e.id === form.etapa_id);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.titulo?.trim()) throw new Error("Título da oportunidade é obrigatório");
      if (!form.etapa_id) throw new Error("Selecione a etapa do funil");
      if (etapaAtual?.tipo === "perdido" && !form.motivo_perda?.trim())
        throw new Error("Informe o motivo da perda");

      const payload = {
        titulo: form.titulo.trim(),
        cliente_id: form.cliente_id || null,
        lead_id: form.lead_id || null,
        contato_nome: form.contato_nome || null,
        contato_telefone: form.contato_telefone || null,
        contato_email: form.contato_email || null,
        valor_estimado: Number(form.valor_estimado ?? 0),
        probabilidade: Number(form.probabilidade ?? 50),
        responsavel_id: form.responsavel_id || null,
        data_prevista: form.data_prevista || null,
        origem: form.origem || null,
        descricao: form.descricao || null,
        servicos: form.servicos || null,
        etapa_id: form.etapa_id,
        observacoes: form.observacoes || null,
        motivo_perda: etapaAtual?.tipo === "perdido" ? form.motivo_perda || null : null,
        valor_fechado: etapaAtual?.tipo === "ganho" ? Number(form.valor_fechado ?? form.valor_estimado ?? 0) : null,
        fechada_em: etapaAtual && etapaAtual.tipo !== "aberta" ? new Date().toISOString() : null,
      };

      if (form.id) {
        const { error } = await supabase.from("crm_oportunidades").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("crm_oportunidades")
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Oportunidade atualizada" : "Oportunidade criada");
      qc.invalidateQueries({ queryKey: ["crm-oportunidades"] });
      qc.invalidateQueries({ queryKey: ["crm-timeline"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <F label="Título *">
              <Input value={form.titulo ?? ""} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </F>
          </div>
          <F label="Cliente">
            <Select value={form.cliente_id ?? ""} onValueChange={(v) => setForm({ ...form, cliente_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Etapa *">
            <Select value={form.etapa_id ?? ""} onValueChange={(v) => setForm({ ...form, etapa_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {etapas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Contato">
            <Input value={form.contato_nome ?? ""} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} />
          </F>
          <F label="Telefone do contato">
            <Input value={form.contato_telefone ?? ""} onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })} />
          </F>
          <F label="Valor estimado (R$)">
            <Input
              type="number"
              step="0.01"
              value={form.valor_estimado ?? 0}
              onChange={(e) => setForm({ ...form, valor_estimado: Number(e.target.value) })}
            />
          </F>
          <F label="Probabilidade (%)">
            <Input
              type="number"
              min={0}
              max={100}
              value={form.probabilidade ?? 50}
              onChange={(e) => setForm({ ...form, probabilidade: Number(e.target.value) })}
            />
          </F>
          <F label="Responsável">
            <Select value={form.responsavel_id ?? ""} onValueChange={(v) => setForm({ ...form, responsavel_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Previsão de fechamento">
            <Input
              type="date"
              value={form.data_prevista ?? ""}
              onChange={(e) => setForm({ ...form, data_prevista: e.target.value || null })}
            />
          </F>
          <F label="Origem">
            <Select value={form.origem ?? ""} onValueChange={(v) => setForm({ ...form, origem: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ORIGENS_LEAD.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Serviços / rotas">
            <Input value={form.servicos ?? ""} onChange={(e) => setForm({ ...form, servicos: e.target.value })} />
          </F>
          {etapaAtual?.tipo === "ganho" && (
            <F label="Valor fechado (R$)">
              <Input
                type="number"
                step="0.01"
                value={form.valor_fechado ?? form.valor_estimado ?? 0}
                onChange={(e) => setForm({ ...form, valor_fechado: Number(e.target.value) })}
              />
            </F>
          )}
          {etapaAtual?.tipo === "perdido" && (
            <div className="md:col-span-2">
              <F label="Motivo da perda *">
                <Input value={form.motivo_perda ?? ""} onChange={(e) => setForm({ ...form, motivo_perda: e.target.value })} />
              </F>
            </div>
          )}
          <div className="md:col-span-2">
            <F label="Descrição">
              <Textarea rows={3} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
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
