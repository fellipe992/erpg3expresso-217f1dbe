import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2, CheckCircle2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormaPagamento = "dinheiro" | "pix" | "boleto" | "ted" | "cartao_credito" | "cartao_debito" | "cheque" | "outro";

export type Lancamento = {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  categoria: string | null;
  valor: number;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  forma_pagamento: FormaPagamento | null;
  status: "pendente" | "pago" | "atrasado" | "cancelado";
  cliente_id: string | null;
  fornecedor_id: string | null;
  viagem_id: string | null;
  numero_documento: string | null;
  observacoes: string | null;
  cliente?: { razao_social: string } | null;
  fornecedor?: { razao_social: string } | null;
};

type DisplayStatus = Lancamento["status"] | "vence_hoje";

const STATUS_META: Record<DisplayStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pendente: { label: "Pendente", variant: "outline" },
  vence_hoje: { label: "Vence hoje", variant: "default" },
  pago: { label: "Pago", variant: "default" },
  atrasado: { label: "Atrasado", variant: "destructive" },
  cancelado: { label: "Cancelado", variant: "secondary" },
};

function displayStatus(l: Lancamento): DisplayStatus {
  if (l.status === "pendente" && l.data_vencimento) {
    const hoje = new Date().toISOString().slice(0, 10);
    if (l.data_vencimento === hoje) return "vence_hoje";
  }
  return l.status;
}

const FORMAS: { value: string; label: string }[] = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "ted", label: "TED / Transferência" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "cheque", label: "Cheque" },
  { value: "outro", label: "Outro" },
];

const CATEGORIAS_RECEBER = ["Frete", "Serviços", "Diária", "Outros"];
const CATEGORIAS_PAGAR = ["Combustível", "Manutenção", "Pedágio", "Salários", "Impostos", "Pneus", "Aluguel", "Seguro", "Outros"];

export function LancamentosPage({ tipo }: { tipo: "receber" | "pagar" }) {
  const { role } = useAuth();
  const canWrite = role === "administrador" || role === "gestor" || role === "financeiro";
  const isAdmin = role === "administrador";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Lancamento>>({ tipo, status: "pendente" });

  const isReceber = tipo === "receber";
  const label = isReceber ? "Contas a receber" : "Contas a pagar";
  const singular = isReceber ? "recebimento" : "pagamento";
  const categoriasBase = isReceber ? CATEGORIAS_RECEBER : CATEGORIAS_PAGAR;

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["financeiro", tipo],
    queryFn: async () => {
      // Marcar atrasados antes de listar
      await supabase.rpc("marcar_atrasados");
      const { data, error } = await supabase
        .from("financeiro_lancamentos")
        .select("*, cliente:clientes(razao_social), fornecedor:fornecedores(razao_social)")
        .eq("tipo", tipo)
        .order("data_vencimento");
      if (error) throw error;
      return (data ?? []) as Lancamento[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-lite"],
    enabled: canWrite && isReceber,
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, razao_social").eq("ativo", true).order("razao_social");
      return data ?? [];
    },
  });
  const { data: fornecedores = [] } = useQuery({
    queryKey: ["fornecedores-lite"],
    enabled: canWrite && !isReceber,
    queryFn: async () => {
      const { data } = await supabase.from("fornecedores").select("id, razao_social").eq("ativo", true).order("razao_social");
      return data ?? [];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["financeiro"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    qc.invalidateQueries({ queryKey: ["motorista-dashboard"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.descricao?.trim()) throw new Error("Descrição obrigatória");
      if (!form.valor || Number(form.valor) <= 0) throw new Error("Valor obrigatório");

      const payload = {
        tipo,
        descricao: form.descricao.trim(),
        categoria: form.categoria?.trim() || null,
        valor: Number(form.valor),
        data_emissao: form.data_emissao || new Date().toISOString().slice(0, 10),
        data_vencimento: form.data_vencimento || null,
        data_pagamento: form.data_pagamento || null,
        forma_pagamento: (form.forma_pagamento as Lancamento["forma_pagamento"]) || null,
        status: (form.status ?? "pendente") as Lancamento["status"],
        cliente_id: isReceber ? form.cliente_id || null : null,
        fornecedor_id: !isReceber ? form.fornecedor_id || null : null,
        viagem_id: form.viagem_id || null,
        numero_documento: form.numero_documento?.trim() || null,
        observacoes: form.observacoes?.trim() || null,
      };

      if (form.id) {
        const { error } = await supabase.from("financeiro_lancamentos").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase.from("financeiro_lancamentos").insert({ ...payload, created_by: userData.user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Lançamento atualizado" : `Novo ${singular} registrado`);
      invalidateAll();
      setOpen(false);
      setForm({ tipo, status: "pendente" });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const marcarPago = useMutation({
    mutationFn: async (l: Lancamento) => {
      const { error } = await supabase
        .from("financeiro_lancamentos")
        .update({
          status: "pago",
          data_pagamento: l.data_pagamento ?? new Date().toISOString().slice(0, 10),
        })
        .eq("id", l.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(isReceber ? "Marcado como recebido" : "Marcado como pago");
      invalidateAll();
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financeiro_lancamentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      invalidateAll();
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const filtered = lancamentos.filter((l) => {
    if (statusFilter !== "todos" && l.status !== statusFilter) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      l.descricao.toLowerCase().includes(q) ||
      (l.categoria ?? "").toLowerCase().includes(q) ||
      (l.numero_documento ?? "").toLowerCase().includes(q) ||
      (l.cliente?.razao_social ?? "").toLowerCase().includes(q) ||
      (l.fornecedor?.razao_social ?? "").toLowerCase().includes(q)
    );
  });

  const totais = filtered.reduce(
    (acc, l) => {
      acc.total += Number(l.valor);
      if (l.status === "pago") acc.pago += Number(l.valor);
      else if (l.status === "atrasado") acc.atrasado += Number(l.valor);
      else if (l.status === "pendente") acc.pendente += Number(l.valor);
      return acc;
    },
    { total: 0, pago: 0, pendente: 0, atrasado: 0 },
  );

  const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");

  const Icon = isReceber ? ArrowDownCircle : ArrowUpCircle;

  return (
    <PageShell
      icon={Icon}
      title={label}
      subtitle={isReceber ? "Fretes e receitas a receber" : "Despesas e contas a pagar"}
      search={search}
      onSearch={setSearch}
      canAdd={canWrite}
      addLabel={`Novo ${singular}`}
      onAdd={() => {
        setForm({
          tipo,
          status: "pendente",
          data_emissao: new Date().toISOString().slice(0, 10),
        });
        setOpen(true);
      }}
    >
      {/* Cards resumo */}
      <div className="grid gap-3 md:grid-cols-4">
        <ResumoCard label="Total" value={fmtBRL(totais.total)} />
        <ResumoCard label={isReceber ? "Recebido" : "Pago"} value={fmtBRL(totais.pago)} tone="success" />
        <ResumoCard label="Pendente" value={fmtBRL(totais.pendente)} />
        <ResumoCard label="Atrasado" value={fmtBRL(totais.atrasado)} tone="danger" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["todos", "pendente", "atrasado", "pago", "cancelado"] as const).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className="capitalize"
          >
            {s}
          </Button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="size-6 animate-spin text-brand" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>{isReceber ? "Cliente" : "Fornecedor"}</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="max-w-xs">
                    <div className="font-medium">{l.descricao}</div>
                    {l.numero_documento && (
                      <div className="text-xs text-muted-foreground">Doc: {l.numero_documento}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {isReceber ? l.cliente?.razao_social ?? "—" : l.fornecedor?.razao_social ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">{l.categoria ?? "—"}</TableCell>
                  <TableCell className="text-sm">{fmtDate(l.data_vencimento)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {fmtBRL(Number(l.valor))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_META[l.status].variant}>{STATUS_META[l.status].label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && l.status !== "pago" && l.status !== "cancelado" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={isReceber ? "Marcar como recebido" : "Marcar como pago"}
                        onClick={() => marcarPago.mutate(l)}
                      >
                        <CheckCircle2 className="size-4 text-brand" />
                      </Button>
                    )}
                    {canWrite && (
                      <Button variant="ghost" size="icon" onClick={() => { setForm(l); setOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon" onClick={() => confirm("Excluir lançamento?") && del.mutate(l.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {form.id ? `Editar ${singular}` : `Novo ${singular}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <F label="Descrição *">
                <Input value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </F>
            </div>
            <F label="Valor (R$) *">
              <Input type="number" step="0.01" value={form.valor ?? ""} onChange={(e) => setForm({ ...form, valor: e.target.value as unknown as number })} />
            </F>
            <F label="Categoria">
              <Select
                value={form.categoria ?? "__none"}
                onValueChange={(v) => setForm({ ...form, categoria: v === "__none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem categoria</SelectItem>
                  {categoriasBase.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Emissão">
              <Input type="date" value={form.data_emissao ?? ""} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} />
            </F>
            <F label="Vencimento *">
              <Input type="date" value={form.data_vencimento ?? ""} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} />
            </F>
            {isReceber ? (
              <F label="Cliente">
                <Select
                  value={form.cliente_id ?? "__none"}
                  onValueChange={(v) => setForm({ ...form, cliente_id: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem cliente</SelectItem>
                    {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            ) : (
              <F label="Fornecedor">
                <Select
                  value={form.fornecedor_id ?? "__none"}
                  onValueChange={(v) => setForm({ ...form, fornecedor_id: v === "__none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem fornecedor</SelectItem>
                    {fornecedores.map((f) => <SelectItem key={f.id} value={f.id}>{f.razao_social}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            )}
            <F label="Nº documento / Nota">
              <Input value={form.numero_documento ?? ""} onChange={(e) => setForm({ ...form, numero_documento: e.target.value })} />
            </F>
            <F label="Forma de pagamento">
              <Select
                value={form.forma_pagamento ?? "__none"}
                onValueChange={(v) => setForm({ ...form, forma_pagamento: v === "__none" ? null : (v as FormaPagamento) })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {FORMAS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Status">
              <Select value={form.status ?? "pendente"} onValueChange={(v) => setForm({ ...form, status: v as Lancamento["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Data de pagamento">
              <Input type="date" value={form.data_pagamento ?? ""} onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })} />
            </F>
            <div className="md:col-span-2">
              <F label="Observações">
                <Textarea rows={2} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
              </F>
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

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ResumoCard({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-brand" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-lg font-bold ${color}`}>{value}</div>
    </Card>
  );
}
