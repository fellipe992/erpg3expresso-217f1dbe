import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Loader2, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/despesas")({
  head: () => ({ meta: [{ title: "Despesas operacionais — G3 Expresso" }] }),
  component: DespesasPage,
});

const CATEGORIAS = [
  "Hospedagem",
  "Alimentação",
  "Pedágio",
  "Estacionamento",
  "Lavagem",
  "Chapa / Descarga",
  "Borracharia",
  "Outros",
];

const FORMAS = ["Dinheiro", "PIX", "Cartão", "Adiantamento", "Outro"];

type Despesa = {
  id: string;
  data: string;
  categoria: string;
  descricao: string | null;
  valor: number;
  forma_pagamento_operacional: string | null;
  observacoes: string | null;
  comprovante_path: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  viagem_id: string | null;
  veiculo?: { placa: string } | null;
  viagem?: { codigo: string | null } | null;
};

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function DespesasPage() {
  const { user, role } = useAuth();
  const isMotorista = role === "motorista";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const { data: meMotorista } = useQuery({
    queryKey: ["me-motorista-despesa", user?.id],
    enabled: !!user?.id && isMotorista,
    queryFn: async () => {
      const { data } = await supabase
        .from("motoristas")
        .select("id, nome, veiculo_id, veiculo:veiculos(placa, modelo)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as { id: string; nome: string; veiculo_id: string | null; veiculo: { placa: string; modelo: string } | null } | null;
    },
  });

  const empty = useMemo(
    () => ({
      data: hojeLocal(),
      categoria: "Hospedagem",
      descricao: "",
      valor: "" as string,
      forma_pagamento_operacional: "Dinheiro",
      observacoes: "",
    }),
    [],
  );
  const [form, setForm] = useState(empty);

  const { data = [], isLoading } = useQuery({
    queryKey: ["despesas-operacionais"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas_operacionais")
        .select("*, veiculo:veiculos(placa), viagem:viagens(codigo)")
        .order("data", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as Despesa[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.categoria) throw new Error("Selecione a categoria");
      const valor = Number(form.valor);
      if (!valor || valor <= 0) throw new Error("Informe o valor");

      let comprovante_path: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${user!.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("abastecimento-comprovantes").upload(path, file);
        if (upErr) throw upErr;
        comprovante_path = path;
      }

      const { error } = await supabase.from("despesas_operacionais").insert({
        data: form.data,
        categoria: form.categoria,
        descricao: form.descricao || null,
        valor,
        forma_pagamento_operacional: form.forma_pagamento_operacional || null,
        observacoes: form.observacoes || null,
        comprovante_path,
        motorista_id: meMotorista?.id ?? null,
        veiculo_id: meMotorista?.veiculo_id ?? null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Despesa registrada");
      qc.invalidateQueries({ queryKey: ["despesas-operacionais"] });
      qc.invalidateQueries({ queryKey: ["financeiro"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
      setForm(empty);
      setFile(null);
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("despesas_operacionais").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["despesas-operacionais"] });
      qc.invalidateQueries({ queryKey: ["financeiro"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const filtered = data.filter((d) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      d.categoria.toLowerCase().includes(q) ||
      (d.descricao ?? "").toLowerCase().includes(q) ||
      (d.veiculo?.placa ?? "").toLowerCase().includes(q)
    );
  });

  const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;

  return (
    <PageShell
      icon={Receipt}
      title="Despesas operacionais"
      subtitle={isMotorista ? "Hotel, alimentação, pedágio e outros custos da viagem" : "Custos operacionais lançados em campo"}
      search={search}
      onSearch={setSearch}
      canAdd={!isMotorista || !!meMotorista}
      addLabel="Nova despesa"
      onAdd={() => { setForm(empty); setFile(null); setOpen(true); }}
    >
      <Card className="divide-y divide-border/60">
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma despesa registrada.</div>
        ) : (
          filtered.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{d.categoria}</span>
                  {d.viagem?.codigo && <Badge variant="outline" className="text-[10px]">{d.viagem.codigo}</Badge>}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {d.data.split("-").reverse().join("/")}
                  {d.veiculo?.placa ? ` · ${d.veiculo.placa}` : ""}
                  {d.descricao ? ` · ${d.descricao}` : ""}
                </div>
              </div>
              <div className="text-sm font-semibold">{brl(d.valor)}</div>
              {role === "administrador" && (
                <Button variant="ghost" size="icon" onClick={() => confirm("Excluir despesa?") && del.mutate(d.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova despesa operacional</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria *</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) *</Label>
              <DecimalInput decimais={2} value={form.valor} onChange={(v) => setForm({ ...form, valor: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={form.forma_pagamento_operacional} onValueChange={(v) => setForm({ ...form, forma_pagamento_operacional: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {FORMAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Descrição</Label>
              <Input placeholder="Ex.: Hotel em Uberlândia" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Comprovante (foto ou PDF)</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
