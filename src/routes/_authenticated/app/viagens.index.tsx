import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Pencil, Trash2, Loader2, ChevronRight, ArrowRight, Play, CheckCircle2 } from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ParadasEditor, novaParada, type ParadaForm } from "@/components/viagem/paradas-editor";
import { sincronizarParadas } from "@/lib/paradas-viagem";

export const Route = createFileRoute("/_authenticated/app/viagens/")({
  head: () => ({ meta: [{ title: "Viagens — G3 Expresso" }] }),
  component: ViagensPage,
});

type Viagem = {
  id: string;
  codigo: string | null;
  cliente_id: string | null;
  motorista_id: string | null;
  veiculo_id: string | null;
  origem_cidade: string | null;
  origem_uf: string | null;
  destino_cidade: string | null;
  destino_uf: string | null;
  data_prevista_saida: string | null;
  data_prevista_chegada: string | null;
  data_saida: string | null;
  data_chegada: string | null;
  km_inicial: number | null;
  km_final: number | null;
  valor_frete: number | null;
  status: "planejada" | "em_andamento" | "concluida" | "cancelada";
  observacoes: string | null;
  cliente?: { razao_social: string } | null;
  motorista?: { nome: string } | null;
  veiculo?: { placa: string; modelo: string } | null;
};

const STATUS_META: Record<Viagem["status"], { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  planejada: { label: "Planejada", variant: "outline" },
  em_andamento: { label: "Em andamento", variant: "default" },
  concluida: { label: "Concluída", variant: "secondary" },
  cancelada: { label: "Cancelada", variant: "destructive" },
};

const emptyForm: Partial<Viagem> = { status: "planejada" };

// Mantém os filtros da tela ao entrar em uma viagem e voltar.
const FILTROS_KEY = "g3:viagens:filtros";
type FiltrosViagens = {
  search: string;
  dataBase: "saida" | "prevista";
  dataDe: string;
  dataAte: string;
  statusFiltro: "todos" | Viagem["status"];
  motoristaFiltro: string;
};
const filtrosPadrao: FiltrosViagens = {
  search: "",
  dataBase: "saida",
  dataDe: "",
  dataAte: "",
  statusFiltro: "todos",
  motoristaFiltro: "todos",
};
function lerFiltros(): FiltrosViagens {
  if (typeof window === "undefined") return filtrosPadrao;
  try {
    const raw = window.sessionStorage.getItem(FILTROS_KEY);
    if (!raw) return filtrosPadrao;
    return { ...filtrosPadrao, ...(JSON.parse(raw) as Partial<FiltrosViagens>) };
  } catch {
    return filtrosPadrao;
  }
}

function ViagensPage() {
  const { role } = useAuth();
  const isMotorista = role === "motorista";
  const canWrite = role === "administrador" || role === "gestor" || role === "financeiro";
  const isAdmin = role === "administrador";
  const qc = useQueryClient();
  const inicial = lerFiltros();
  const [search, setSearch] = useState(inicial.search);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Viagem>>(emptyForm);
  const [paradasForm, setParadasForm] = useState<ParadaForm[]>([]);
  const [dataBase, setDataBase] = useState<"saida" | "prevista">(inicial.dataBase);
  const [dataDe, setDataDe] = useState(inicial.dataDe);
  const [dataAte, setDataAte] = useState(inicial.dataAte);
  const [statusFiltro, setStatusFiltro] = useState<"todos" | Viagem["status"]>(inicial.statusFiltro);
  const [motoristaFiltro, setMotoristaFiltro] = useState<string>(inicial.motoristaFiltro);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        FILTROS_KEY,
        JSON.stringify({ search, dataBase, dataDe, dataAte, statusFiltro, motoristaFiltro }),
      );
    } catch {
      /* sessionStorage indisponível */
    }
  }, [search, dataBase, dataDe, dataAte, statusFiltro, motoristaFiltro]);

  // Carrega o roteiro já cadastrado ao editar uma viagem existente.
  const { data: paradasSalvas, isFetching: paradasCarregando } = useQuery({
    queryKey: ["viagem-paradas-form", form.id],
    enabled: Boolean(open && form.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagem_paradas")
        .select("ordem, cliente, endereco, nf")
        .eq("viagem_id", form.id!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        cliente: p.cliente ?? "",
        endereco: p.endereco,
        nf: p.nf ?? "",
      })) as ParadaForm[];
    },
  });
  useEffect(() => {
    if (paradasSalvas) setParadasForm(paradasSalvas);
  }, [paradasSalvas]);

  const { data: viagens = [], isLoading } = useQuery({
    queryKey: ["viagens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select("*, cliente:clientes(razao_social), motorista:motoristas(nome), veiculo:veiculos(placa, modelo)")
        .order("data_prevista_saida", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Viagem[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-lite"],
    enabled: canWrite,
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, razao_social").eq("ativo", true).order("razao_social");
      return data ?? [];
    },
  });
  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas-lite"],
    enabled: !isMotorista,
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("id, nome").eq("ativo", true).order("nome");
      return data ?? [];
    },
  });
  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-lite"],
    enabled: canWrite,
    queryFn: async () => {
      const { data } = await supabase.from("veiculos").select("id, placa, modelo").eq("ativo", true).order("placa");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        // codigo: gerado automaticamente pela sequência do banco (BEFORE INSERT trigger)
        cliente_id: form.cliente_id || null,
        motorista_id: form.motorista_id || null,
        veiculo_id: form.veiculo_id || null,
        origem_cidade: form.origem_cidade?.trim() || null,
        origem_uf: form.origem_uf?.trim().toUpperCase() || null,
        destino_cidade: form.destino_cidade?.trim() || null,
        destino_uf: form.destino_uf?.trim().toUpperCase() || null,
        data_prevista_saida: form.data_prevista_saida || null,
        data_prevista_chegada: form.data_prevista_chegada || null,
        valor_frete: form.valor_frete ? Number(form.valor_frete) : null,
        status: (form.status ?? "planejada") as Viagem["status"],
        observacoes: form.observacoes?.trim() || null,
      };
      let viagemId = form.id;
      if (form.id) {
        const { error } = await supabase.from("viagens").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("viagens")
          .insert({ ...payload, created_by: userData.user?.id })
          .select("id")
          .single();
        if (error) throw error;
        viagemId = data.id;
      }
      // Só sincroniza paradas quando o roteiro salvo já foi carregado no formulário.
      // Evita apagar as paradas existentes se o usuário salvar antes da consulta responder.
      const paradasProntas = !form.id || (!paradasCarregando && paradasSalvas !== undefined);
      if (viagemId && paradasProntas) await sincronizarParadas(viagemId, paradasForm);
    },
    onSuccess: () => {
      toast.success(form.id ? "Viagem atualizada" : "Viagem criada");
      qc.invalidateQueries({ queryKey: ["viagens"] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-paradas"] }); qc.invalidateQueries({ queryKey: ["viagem-paradas-form"] });
      setOpen(false);
      setForm(emptyForm);
      setParadasForm([]);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("viagens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Viagem removida");
      qc.invalidateQueries({ queryKey: ["viagens"] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] });
    },
    onError: (e: Error) => toast.error("Erro ao remover", { description: e.message }),
  });

  const filtered = viagens.filter((v) => {
    if (statusFiltro !== "todos" && v.status !== statusFiltro) return false;
    if (motoristaFiltro !== "todos") {
      if (motoristaFiltro === "sem") {
        if (v.motorista_id) return false;
      } else if (v.motorista_id !== motoristaFiltro) return false;
    }
    // Período pela data da viagem escolhida (saída real ou prevista), não pelo lançamento.
    if (dataDe || dataAte) {
      const bruto = dataBase === "prevista" ? v.data_prevista_saida : v.data_saida ?? v.data_prevista_saida;
      const ref = (bruto ?? "").slice(0, 10);
      if (!ref) return false;
      if (dataDe && ref < dataDe) return false;
      if (dataAte && ref > dataAte) return false;
    }
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (v.codigo ?? "").toLowerCase().includes(q) ||
      (v.cliente?.razao_social ?? "").toLowerCase().includes(q) ||
      (v.motorista?.nome ?? "").toLowerCase().includes(q) ||
      (v.veiculo?.placa ?? "").toLowerCase().includes(q) ||
      (v.origem_cidade ?? "").toLowerCase().includes(q) ||
      (v.destino_cidade ?? "").toLowerCase().includes(q)
    );
  });


  if (isMotorista) {
    return <MotoristaViagensView viagens={filtered} isLoading={isLoading} search={search} setSearch={setSearch} />;
  }

  const toDatetimeLocal = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : "");

  return (
    <PageShell
      icon={MapPin}
      title="Viagens"
      subtitle="Planejamento e acompanhamento operacional"
      search={search}
      onSearch={setSearch}
      canAdd={canWrite}
      addLabel="Nova viagem"
      onAdd={() => {
        setForm(emptyForm);
        setParadasForm([]);
        setOpen(true);
      }}
    >
      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Motorista</Label>
            <Select value={motoristaFiltro} onValueChange={setMotoristaFiltro}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os motoristas</SelectItem>
                <SelectItem value="sem">Sem motorista</SelectItem>
                {motoristas.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</Label>
            <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as typeof statusFiltro)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="planejada">Planejada</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Filtrar período por</Label>
            <Select value={dataBase} onValueChange={(v) => setDataBase(v as typeof dataBase)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="saida">Data da viagem (saída)</SelectItem>
                <SelectItem value="prevista">Data prevista de saída</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">De</Label>
            <Input type="date" className="h-9" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Até</Label>
            <Input type="date" className="h-9" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </div>
          <div className="flex items-end justify-between gap-2 text-xs text-muted-foreground">
            <span>{filtered.length} viagem(ns)</span>
            {(dataDe || dataAte || statusFiltro !== "todos" || motoristaFiltro !== "todos") && (
              <Button variant="ghost" size="sm" onClick={() => { setDataDe(""); setDataAte(""); setStatusFiltro("todos"); setMotoristaFiltro("todos"); }}>Limpar</Button>
            )}
          </div>
        </div>
      </Card>

      <Card>

        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="size-6 animate-spin text-brand" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhuma viagem encontrada.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Rota</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <TableRow key={v.id} className="group">
                  <TableCell className="font-mono text-xs">{v.codigo ?? v.id.slice(0, 6).toUpperCase()}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-1.5">
                      <span>{v.origem_cidade ?? "—"}{v.origem_uf ? `/${v.origem_uf}` : ""}</span>
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <span>{v.destino_cidade ?? "—"}{v.destino_uf ? `/${v.destino_uf}` : ""}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{v.cliente?.razao_social ?? "—"}</TableCell>
                  <TableCell className="text-sm">{v.motorista?.nome ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {v.veiculo ? <span className="font-mono">{v.veiculo.placa}</span> : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {v.data_prevista_saida ? new Date(v.data_prevista_saida).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_META[v.status].variant}>{STATUS_META[v.status].label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link to="/app/viagens/$id" params={{ id: v.id }}>
                        <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                    {canWrite && (
                      <Button variant="ghost" size="icon" onClick={() => { setForm(v); setParadasForm([]); setOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon" onClick={() => confirm(`Excluir viagem?`) && del.mutate(v.id)}>
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
            <DialogTitle>{form.id ? "Editar viagem" : "Nova viagem"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Código / OS"><Input value={form.codigo ?? ""} readOnly disabled placeholder="Gerado automaticamente" className="font-mono" /></F>
            <F label="Status">
              <Select value={form.status ?? "planejada"} onValueChange={(v) => setForm({ ...form, status: v as Viagem["status"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>

            <F label="Cliente">
              <Select value={form.cliente_id ?? "__none"} onValueChange={(v) => setForm({ ...form, cliente_id: v === "__none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem cliente</SelectItem>
                  {clientes.map((c) => <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Motorista">
              <Select value={form.motorista_id ?? "__none"} onValueChange={(v) => setForm({ ...form, motorista_id: v === "__none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem motorista</SelectItem>
                  {motoristas.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Veículo">
              <Select value={form.veiculo_id ?? "__none"} onValueChange={(v) => setForm({ ...form, veiculo_id: v === "__none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem veículo</SelectItem>
                  {veiculos.map((v) => <SelectItem key={v.id} value={v.id}>{v.placa} · {v.modelo}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>
            <F label="Valor do frete (R$)">
              <DecimalInput decimais={2} value={form.valor_frete ?? ""} onChange={(v) => setForm({ ...form, valor_frete: v === "" ? null : Number(v) })} />
            </F>

            <F label="Origem — Cidade"><Input value={form.origem_cidade ?? ""} onChange={(e) => setForm({ ...form, origem_cidade: e.target.value })} /></F>
            <F label="Origem — UF"><Input maxLength={2} value={form.origem_uf ?? ""} onChange={(e) => setForm({ ...form, origem_uf: e.target.value.toUpperCase() })} /></F>
            <F label="Destino — Cidade"><Input value={form.destino_cidade ?? ""} onChange={(e) => setForm({ ...form, destino_cidade: e.target.value })} /></F>
            <F label="Destino — UF"><Input maxLength={2} value={form.destino_uf ?? ""} onChange={(e) => setForm({ ...form, destino_uf: e.target.value.toUpperCase() })} /></F>

            <F label="Saída prevista">
              <Input type="datetime-local" value={toDatetimeLocal(form.data_prevista_saida)} onChange={(e) => setForm({ ...form, data_prevista_saida: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </F>
            <F label="Chegada prevista">
              <Input type="datetime-local" value={toDatetimeLocal(form.data_prevista_chegada)} onChange={(e) => setForm({ ...form, data_prevista_chegada: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            </F>

            <div className="md:col-span-2">
              <F label="Observações"><Textarea rows={2} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></F>
            </div>

            <div className="md:col-span-2">
              <ParadasEditor
                paradas={paradasForm}
                onChange={setParadasForm}
                origem={[form.origem_cidade, form.origem_uf].filter(Boolean).join(" - ")}
                destino={[form.destino_cidade, form.destino_uf].filter(Boolean).join(" - ")}
              />
              {paradasForm.length === 0 && (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setParadasForm([novaParada()])}>
                  Adicionar endereços de destino
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || paradasCarregando}>
              {(save.isPending || paradasCarregando) && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function MotoristaViagensView({
  viagens,
  isLoading,
  search,
  setSearch,
}: {
  viagens: Viagem[];
  isLoading: boolean;
  search: string;
  setSearch: (v: string) => void;
}) {
  const [tab, setTab] = useState<"planejada" | "em_andamento" | "concluida">("em_andamento");
  const grouped = {
    planejada: viagens.filter((v) => v.status === "planejada"),
    em_andamento: viagens.filter((v) => v.status === "em_andamento"),
    concluida: viagens.filter((v) => v.status === "concluida"),
  };
  const lista = grouped[tab];

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="font-display text-xl font-bold">Minhas viagens</h1>
        <p className="text-xs text-muted-foreground">Toque em uma viagem para ver detalhes, iniciar ou finalizar.</p>
      </div>
      <Input placeholder="Buscar por cidade, cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
        {([
          ["em_andamento", "Em andamento", grouped.em_andamento.length],
          ["planejada", "Planejadas", grouped.planejada.length],
          ["concluida", "Concluídas", grouped.concluida.length],
        ] as const).map(([k, label, count]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-2 py-2 text-xs font-medium transition ${
              tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {label} <span className="ml-1 text-[10px] opacity-70">({count})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
      ) : lista.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma viagem nesta categoria.</Card>
      ) : (
        <div className="space-y-3">
          {lista.map((v) => (
            <Card key={v.id} className="overflow-hidden transition hover:border-brand hover:shadow-md">
              <Link to="/app/viagens/$id" params={{ id: v.id }} className="block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge variant={STATUS_META[v.status].variant}>{STATUS_META[v.status].label}</Badge>
                      {v.codigo && <span className="font-mono text-xs text-muted-foreground">OS #{v.codigo}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <span>{v.origem_cidade ?? "—"}{v.origem_uf ? `/${v.origem_uf}` : ""}</span>
                      <ArrowRight className="size-3.5 text-brand" />
                      <span>{v.destino_cidade ?? "—"}{v.destino_uf ? `/${v.destino_uf}` : ""}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {v.cliente?.razao_social ?? "Sem cliente"}
                      {v.veiculo && <> · <span className="font-mono">{v.veiculo.placa}</span></>}
                    </div>
                    {v.data_prevista_saida && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Prev. saída: {new Date(v.data_prevista_saida).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </div>
              </Link>
              {v.status === "planejada" && (
                <div className="border-t border-border/60 bg-brand-subtle/30 p-2">
                  <Button
                    asChild
                    className="w-full bg-brand text-white hover:bg-brand/90"
                    size="sm"
                  >
                    <Link to="/app/viagens/$id" params={{ id: v.id }} hash="iniciar">
                      <Play className="mr-2 size-4" /> Iniciar viagem
                    </Link>
                  </Button>
                </div>
              )}
              {v.status === "em_andamento" && (
                <div className="border-t border-border/60 bg-brand-subtle/30 p-2">
                  <Button
                    asChild
                    variant="secondary"
                    className="w-full"
                    size="sm"
                  >
                    <Link to="/app/viagens/$id" params={{ id: v.id }} hash="finalizar">
                      <CheckCircle2 className="mr-2 size-4" /> Finalizar viagem
                    </Link>
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
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
