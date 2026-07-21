import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2, CheckCircle2, ArrowDownCircle, ArrowUpCircle, ExternalLink, Eye, Printer, FilterX } from "lucide-react";

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
import { PlanoContaSelector, type PlanoContaSelection } from "@/components/financeiro/plano-conta-selector";

type FormaPagamento = "dinheiro" | "pix" | "boleto" | "ted" | "cartao_credito" | "cartao_debito" | "cheque" | "outro";

export type Lancamento = {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  categoria: string | null;
  centro_custo: string | null;
  valor: number;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  forma_pagamento: FormaPagamento | null;
  status: "pendente" | "pago" | "atrasado" | "cancelado";
  cliente_id: string | null;
  fornecedor_id: string | null;
  viagem_id: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  origem: string | null;
  origem_id: string | null;
  numero_documento: string | null;
  observacoes: string | null;
  plano_conta_id: string | null;
  created_by: string | null;
  cliente?: { razao_social: string } | null;
  fornecedor?: { razao_social: string } | null;
  veiculo?: { placa: string } | null;
  motorista?: { nome: string } | null;
  plano_conta?: { codigo: string; nome: string; centro_custo: string | null } | null;
  viagem?: { codigo: string | null } | null;
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
  const [categoriaFilter, setCategoriaFilter] = useState<string>("todas");
  const [centroCustoFilter, setCentroCustoFilter] = useState<string>("todos");
  const [veiculoFilter, setVeiculoFilter] = useState<string>("todos");
  const [motoristaFilter, setMotoristaFilter] = useState<string>("todos");
  const [parceiroFilter, setParceiroFilter] = useState<string>("todos"); // cliente ou fornecedor
  const [dataDe, setDataDe] = useState<string>("");
  const [dataAte, setDataAte] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Lancamento>>({ tipo, status: "pendente" });
  const [plano, setPlano] = useState<PlanoContaSelection>({ grupoId: null, subgrupoId: null, contaId: null });
  const [viewing, setViewing] = useState<Lancamento | null>(null);

  const isReceber = tipo === "receber";
  const label = isReceber ? "Contas a receber" : "Contas a pagar";
  const singular = isReceber ? "recebimento" : "pagamento";
  const categoriasBase = isReceber ? CATEGORIAS_RECEBER : CATEGORIAS_PAGAR;
  void categoriasBase;

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ["financeiro", tipo],
    queryFn: async () => {
      await supabase.rpc("marcar_atrasados");
      const { data, error } = await supabase
        .from("financeiro_lancamentos")
        .select("*, cliente:clientes(razao_social), fornecedor:fornecedores(razao_social), veiculo:veiculos(placa), motorista:motoristas(nome), plano_conta:plano_contas(codigo, nome, centro_custo), viagem:viagens(codigo)")
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

  // Listas para filtros
  const { data: veiculosList = [] } = useQuery({
    queryKey: ["veiculos-filter-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("veiculos").select("id, placa").order("placa");
      return data ?? [];
    },
  });
  const { data: motoristasList = [] } = useQuery({
    queryKey: ["motoristas-filter-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("id, nome").order("nome");
      return data ?? [];
    },
  });
  const { data: categoriasList = [] } = useQuery({
    queryKey: ["categorias-plano", tipo],
    queryFn: async () => {
      // Categorias = subgrupos do plano de contas do tipo correspondente
      const tiposGrupo: ("receita" | "despesa" | "outros")[] = isReceber ? ["receita"] : ["despesa", "outros"];
      const { data: grupos } = await supabase.from("plano_grupos").select("id").eq("ativo", true).in("tipo", tiposGrupo);
      const grupoIds = (grupos ?? []).map((g) => g.id);
      if (!grupoIds.length) return [] as { id: string; nome: string }[];
      const { data } = await supabase
        .from("plano_subgrupos")
        .select("id, nome")
        .eq("ativo", true)
        .in("grupo_id", grupoIds)
        .order("nome");
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const { data: centrosCustoList = [] } = useQuery({
    queryKey: ["centros-custo-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("centros_custo").select("id, nome").eq("ativo", true).order("nome");
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["financeiro"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    qc.invalidateQueries({ queryKey: ["motorista-dashboard"] });
    qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.descricao?.trim()) throw new Error("Descrição obrigatória");
      if (!form.valor || Number(form.valor) <= 0) throw new Error("Valor obrigatório");
      if (!plano.contaId) throw new Error("Selecione a conta financeira (Grupo → Subgrupo → Conta)");

      const { data: contaInfo } = await supabase
        .from("plano_contas")
        .select("centro_custo, nome, plano_subgrupos!inner(nome)")
        .eq("id", plano.contaId)
        .maybeSingle();
      const contaData = contaInfo as { centro_custo: string | null; nome: string; plano_subgrupos: { nome: string } } | null;

      const payload = {
        tipo,
        descricao: form.descricao.trim(),
        categoria: contaData?.plano_subgrupos.nome ?? form.categoria?.trim() ?? null,
        plano_conta_id: plano.contaId,
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
        centro_custo: contaData?.centro_custo ?? form.centro_custo?.trim() ?? null,
        veiculo_id: form.veiculo_id || null,
        motorista_id: form.motorista_id || null,
        origem: form.origem || (form.id ? undefined : "manual"),
        origem_id: form.origem_id || (form.id ? undefined : null),
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
      setPlano({ grupoId: null, subgrupoId: null, contaId: null });
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

  const categoriaNomes = useMemo(() => new Set(categoriasList.map((c) => c.nome)), [categoriasList]);
  void categoriaNomes;

  const filtered = lancamentos.filter((l) => {
    if (statusFilter !== "todos" && l.status !== statusFilter) return false;
    if (categoriaFilter !== "todas" && (l.categoria ?? "") !== categoriaFilter) return false;
    if (centroCustoFilter !== "todos" && (l.centro_custo ?? "") !== centroCustoFilter) return false;
    if (veiculoFilter !== "todos" && l.veiculo_id !== veiculoFilter) return false;
    if (motoristaFilter !== "todos" && l.motorista_id !== motoristaFilter) return false;
    if (parceiroFilter !== "todos") {
      const pid = isReceber ? l.cliente_id : l.fornecedor_id;
      if (pid !== parceiroFilter) return false;
    }
    const ref = l.data_vencimento ?? l.data_emissao;
    if (dataDe && ref && ref < dataDe) return false;
    if (dataAte && ref && ref > dataAte) return false;

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

  const clearFilters = () => {
    setStatusFilter("todos");
    setCategoriaFilter("todas");
    setCentroCustoFilter("todos");
    setVeiculoFilter("todos");
    setMotoristaFilter("todos");
    setParceiroFilter("todos");
    setDataDe("");
    setDataAte("");
  };

  const parceiroLista = isReceber ? clientes : fornecedores;

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
        setPlano({ grupoId: null, subgrupoId: null, contaId: null });
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

      {/* Filtros */}
      <Card className="p-3 space-y-3">
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
          <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto">
            <FilterX className="mr-1 size-3.5" /> Limpar
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Categoria</Label>
            <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categoriasList.map((c) => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Centro de custo</Label>
            <Select value={centroCustoFilter} onValueChange={setCentroCustoFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {centrosCustoList.map((c) => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Veículo</Label>
            <Select value={veiculoFilter} onValueChange={setVeiculoFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {veiculosList.map((v) => <SelectItem key={v.id} value={v.id}>{v.placa}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Motorista</Label>
            <Select value={motoristaFilter} onValueChange={setMotoristaFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {motoristasList.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{isReceber ? "Cliente" : "Fornecedor"}</Label>
            <Select value={parceiroFilter} onValueChange={setParceiroFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {parceiroLista.map((p: { id: string; razao_social: string }) => (
                  <SelectItem key={p.id} value={p.id}>{p.razao_social}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Período de</Label>
            <Input type="date" className="h-9" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Período até</Label>
            <Input type="date" className="h-9" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </div>
          <div className="flex items-end text-xs text-muted-foreground">
            {filtered.length} lançamento(s) exibido(s)
          </div>
        </div>
      </Card>

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
                <TableHead>Origem</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead>Veículo / Motorista</TableHead>
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
                      <div className="text-xs text-muted-foreground">OS/Doc: {l.numero_documento}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {isReceber ? l.cliente?.razao_social ?? "—" : l.fornecedor?.razao_social ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.categoria ?? "—"}
                    {l.plano_conta && (
                      <div className="font-mono text-[10px] text-muted-foreground">{l.plano_conta.codigo}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.origem ? <Badge variant="outline" className="capitalize">{l.origem}</Badge> : <span className="text-muted-foreground">manual</span>}
                  </TableCell>
                  <TableCell className="text-xs">{l.centro_custo ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {l.veiculo?.placa && <div className="font-mono">{l.veiculo.placa}</div>}
                    {l.motorista?.nome && <div className="text-muted-foreground">{l.motorista.nome}</div>}
                    {!l.veiculo?.placa && !l.motorista?.nome && "—"}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(l.data_vencimento)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {fmtBRL(Number(l.valor))}
                  </TableCell>
                  <TableCell>
                    {(() => { const ds = displayStatus(l); return <Badge variant={STATUS_META[ds].variant}>{STATUS_META[ds].label}</Badge>; })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" title="Visualizar" onClick={() => setViewing(l)}>
                      <Eye className="size-4" />
                    </Button>
                    <OrigemButton l={l} />
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
                      <Button variant="ghost" size="icon" onClick={() => { setForm(l); setPlano({ grupoId: null, subgrupoId: null, contaId: l.plano_conta_id }); setOpen(true); }}>
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

      {/* Modal Edição */}
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
            <div className="md:col-span-2">
              <PlanoContaSelector
                value={plano}
                onChange={setPlano}
                filterTipo={isReceber ? "receita" : "despesa"}
                required
              />
            </div>
            <F label="Valor (R$) *">
              <Input type="number" step="0.01" value={form.valor ?? ""} onChange={(e) => setForm({ ...form, valor: e.target.value as unknown as number })} />
            </F>
            <F label="Emissão">
              <Input type="date" value={form.data_emissao ?? ""} onChange={(e) => setForm({ ...form, data_emissao: e.target.value })} />
            </F>
            <F label={isReceber ? "Vencimento (opcional)" : "Vencimento"}>
              <Input type="date" value={form.data_vencimento ?? ""} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value || null })} />
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

      {/* Modal Visualização */}
      <ViewLancamentoDialog
        lancamento={viewing}
        open={!!viewing}
        onClose={() => setViewing(null)}
        isReceber={isReceber}
      />
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

function OrigemButton({ l }: { l: Lancamento }) {
  if (!l.origem || !l.origem_id) return null;
  let to: string | null = null;
  const params: Record<string, string> = {};
  if (l.origem === "viagem") { to = "/app/viagens/$id"; params.id = l.origem_id; }
  else if (l.origem === "abastecimento") to = "/app/abastecimentos";
  else if (l.origem === "manutencao") to = "/app/manutencoes";
  else if (l.viagem_id) { to = "/app/viagens/$id"; params.id = l.viagem_id; }
  if (!to) return null;
  return (
    <Button asChild variant="ghost" size="icon" title="Visualizar origem">
      <Link to={to} params={params as never}>
        <ExternalLink className="size-4" />
      </Link>
    </Button>
  );
}

// ============================================================
// Modal de Visualização (somente leitura) + Gerar Comprovante
// ============================================================

const FORMA_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  boleto: "Boleto",
  ted: "TED / Transferência",
  cartao_credito: "Cartão de crédito",
  cartao_debito: "Cartão de débito",
  cheque: "Cheque",
  outro: "Outro",
};

function ViewLancamentoDialog({
  lancamento,
  open,
  onClose,
  isReceber,
}: {
  lancamento: Lancamento | null;
  open: boolean;
  onClose: () => void;
  isReceber: boolean;
}) {
  const { data: responsavel } = useQuery({
    queryKey: ["profile-created-by", lancamento?.created_by],
    enabled: !!lancamento?.created_by,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nome, email").eq("id", lancamento!.created_by!).maybeSingle();
      return data as { nome: string | null; email: string | null } | null;
    },
  });

  if (!lancamento) return null;

  const l = lancamento;
  const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
  const parceiro = isReceber ? l.cliente?.razao_social : l.fornecedor?.razao_social;
  const responsavelNome = responsavel?.nome || responsavel?.email || "—";
  const statusLabel = STATUS_META[displayStatus(l)].label;

  const handlePrint = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const html = comprovanteHTML({
      l,
      isReceber,
      parceiro: parceiro ?? null,
      responsavelNome,
      statusLabel,
    });
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5" /> Detalhes do lançamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cabeçalho / Valor */}
          <Card className="p-4 bg-muted/30">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {isReceber ? "Recebimento" : "Pagamento"}
                </div>
                <div className="mt-1 font-display text-xl font-bold">{l.descricao}</div>
                {l.numero_documento && (
                  <div className="text-xs text-muted-foreground mt-1">OS / Documento: {l.numero_documento}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Valor</div>
                <div className="font-display text-2xl font-bold text-brand">{fmtBRL(Number(l.valor))}</div>
                <Badge variant={STATUS_META[displayStatus(l)].variant} className="mt-1">{statusLabel}</Badge>
              </div>
            </div>
          </Card>

          {/* Grid de informações */}
          <div className="grid gap-3 md:grid-cols-2">
            <InfoRow label="Categoria" value={l.categoria ?? "—"} />
            <InfoRow
              label="Plano de Contas"
              value={l.plano_conta ? `${l.plano_conta.codigo} — ${l.plano_conta.nome}` : "—"}
            />
            <InfoRow label="Centro de Custo" value={l.centro_custo ?? "—"} />
            <InfoRow label="Forma de Pagamento" value={l.forma_pagamento ? FORMA_LABEL[l.forma_pagamento] ?? l.forma_pagamento : "—"} />
            <InfoRow label="Data de Emissão" value={fmtDate(l.data_emissao)} />
            <InfoRow label="Data de Vencimento" value={fmtDate(l.data_vencimento)} />
            <InfoRow label="Data de Pagamento" value={fmtDate(l.data_pagamento)} />
            <InfoRow label={isReceber ? "Cliente" : "Fornecedor"} value={parceiro ?? "—"} />
            {l.motorista?.nome && <InfoRow label="Motorista" value={l.motorista.nome} />}
            {l.veiculo?.placa && <InfoRow label="Veículo" value={l.veiculo.placa} />}
            {l.viagem?.codigo && <InfoRow label="Viagem vinculada" value={`OS ${l.viagem.codigo}`} />}
            <InfoRow label="Responsável pelo lançamento" value={responsavelNome} />
          </div>

          {/* Observações em destaque */}
          {l.observacoes && (
            <Card className="p-4 border-brand/40 border-l-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Observações</div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{l.observacoes}</pre>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 size-4" /> Gerar Comprovante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border/50 pb-1.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function comprovanteHTML({
  l,
  isReceber,
  parceiro,
  responsavelNome,
  statusLabel,
}: {
  l: Lancamento;
  isReceber: boolean;
  parceiro: string | null;
  responsavelNome: string;
  statusLabel: string;
}): string {
  const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—");
  const row = (label: string, value: string | null | undefined) =>
    value ? `<tr><td class="lbl">${escapeHTML(label)}</td><td class="val">${escapeHTML(value)}</td></tr>` : "";

  const tituloTipo = isReceber ? "COMPROVANTE DE RECEBIMENTO" : "COMPROVANTE DE PAGAMENTO";

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>${escapeHTML(tituloTipo)} — ${escapeHTML(l.descricao)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:#141414; margin: 0; padding: 32px; background: #fff; }
  .wrap { max-width: 720px; margin: 0 auto; }
  .brand { color: #F15A24; font-weight: 800; font-size: 20px; letter-spacing: 0.5px; }
  .empresa { font-size: 12px; color: #7C7C7C; margin-top:2px; }
  h1 { font-size: 18px; margin: 24px 0 4px; letter-spacing: 1px; }
  .subtitle { font-size: 12px; color: #7C7C7C; text-transform: uppercase; letter-spacing: 2px; }
  .headline { margin-top: 20px; padding: 16px; background: #fafafa; border-left: 4px solid #F15A24; border-radius: 4px; }
  .headline .desc { font-size: 16px; font-weight: 700; }
  .headline .valor { font-size: 28px; font-weight: 800; color: #F15A24; margin-top: 4px; }
  .headline .status { display:inline-block; margin-top:6px; padding:2px 10px; border-radius:999px; font-size: 11px; background: #141414; color: #fff; letter-spacing:1px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  td { padding: 8px 6px; font-size: 13px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.lbl { width: 220px; color: #7C7C7C; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
  td.val { font-weight: 500; }
  .obs { margin-top: 24px; padding: 16px; border: 1px solid #eee; border-left: 4px solid #F15A24; border-radius: 4px; background: #fff; }
  .obs h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #7C7C7C; }
  .obs pre { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.6; }
  .footer { margin-top: 40px; font-size: 10px; color: #7C7C7C; text-align: center; letter-spacing: 1px; text-transform: uppercase; }
  @media print { body { padding: 16px; } .no-print { display: none; } }
  .actions { margin: 16px 0; text-align:right; }
  .actions button { background: #F15A24; color: #fff; border:0; padding: 8px 16px; border-radius: 4px; font-size: 13px; cursor: pointer; }
</style>
</head><body>
<div class="wrap">
  <div class="actions no-print"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
  <div class="brand">G3 EXPRESSO</div>
  <div class="empresa">Controle Financeiro</div>
  <h1>${escapeHTML(tituloTipo)}</h1>
  <div class="subtitle">Nº ${escapeHTML(l.id.slice(0, 8).toUpperCase())} · Emitido em ${escapeHTML(new Date().toLocaleDateString("pt-BR"))}</div>

  <div class="headline">
    <div class="desc">${escapeHTML(l.descricao)}</div>
    <div class="valor">${escapeHTML(fmtBRL(Number(l.valor)))}</div>
    <div class="status">${escapeHTML(statusLabel)}</div>
  </div>

  <table>
    ${row("Categoria", l.categoria)}
    ${row("Plano de Contas", l.plano_conta ? `${l.plano_conta.codigo} — ${l.plano_conta.nome}` : null)}
    ${row("Centro de Custo", l.centro_custo)}
    ${row("Forma de Pagamento", l.forma_pagamento ? FORMA_LABEL[l.forma_pagamento] ?? l.forma_pagamento : null)}
    ${row("Nº Documento / OS", l.numero_documento)}
    ${row("Data de Emissão", fmtDate(l.data_emissao))}
    ${row("Data de Vencimento", fmtDate(l.data_vencimento))}
    ${row("Data de Pagamento", fmtDate(l.data_pagamento))}
    ${row(isReceber ? "Cliente" : "Fornecedor", parceiro)}
    ${row("Motorista", l.motorista?.nome ?? null)}
    ${row("Veículo", l.veiculo?.placa ?? null)}
    ${row("Viagem vinculada", l.viagem?.codigo ? `OS ${l.viagem.codigo}` : null)}
    ${row("Responsável pelo lançamento", responsavelNome)}
  </table>

  ${l.observacoes ? `<div class="obs"><h3>Observações</h3><pre>${escapeHTML(l.observacoes)}</pre></div>` : ""}

  <div class="footer">Documento gerado automaticamente pelo sistema G3 Expresso</div>
</div>
</body></html>`;
}
