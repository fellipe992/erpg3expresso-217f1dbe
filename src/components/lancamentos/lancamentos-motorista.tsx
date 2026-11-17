import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2, Package, HandCoins } from "lucide-react";

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

type Modo = "peca" | "antecipacao";
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const up = (v: string) => v.toUpperCase();

type Registro = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  quantidade?: number;
  fornecedor?: string | null;
  nota_fiscal?: string | null;
  fechamento_id: string | null;
  veiculo?: { placa: string; agregado: boolean | null } | null;
  motorista?: { nome: string } | null;
};

export function LancamentosMotoristaPage({ modo }: { modo: Modo }) {
  const peca = modo === "peca";
  const tabela = peca ? "pecas" : "motorista_antecipacoes";
  const { role } = useAuth();
  const staff = role !== "motorista";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const vazio = { data: hoje(), veiculo_id: "", motorista_id: "", descricao: "", quantidade: "1", valor: "", fornecedor: "", nota_fiscal: "", observacoes: "" };
  const [form, setForm] = useState(vazio);

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-min"],
    queryFn: async () => (await supabase.from("veiculos").select("id, placa, agregado").order("placa")).data ?? [],
  });
  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas-min"],
    queryFn: async () =>
      (await supabase.from("motoristas").select("id, nome, veiculo_id").eq("ativo", true).order("nome")).data ?? [],
  });

  const { data = [], isLoading } = useQuery({
    queryKey: [tabela],
    queryFn: async () => {
      const sel = peca
        ? "id, data, descricao, valor:valor_total, quantidade, fornecedor, nota_fiscal, fechamento_id, veiculo:veiculos(placa, agregado), motorista:motoristas(nome)"
        : "id, data, descricao, valor, fechamento_id, veiculo:veiculos(placa, agregado), motorista:motoristas(nome)";
      const { data, error } = await supabase.from(tabela).select(sel).order("data", { ascending: false }).limit(500);
      if (error) throw error;
      return data as unknown as Registro[];
    },
  });

  const filtrados = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return data;
    return data.filter((r) =>
      [r.descricao, r.veiculo?.placa, r.motorista?.nome, r.fornecedor].some((x) => (x ?? "").toLowerCase().includes(t)),
    );
  }, [data, search]);

  const salvar = useMutation({
    mutationFn: async () => {
      const valor = Number(form.valor);
      if (!form.descricao.trim()) throw new Error("Informe a descrição");
      if (!valor || valor <= 0) throw new Error("Informe o valor");
      if (peca && !form.veiculo_id) throw new Error("Selecione a placa");
      if (!peca && !form.motorista_id) throw new Error("Selecione o motorista");
      const base = {
        data: form.data,
        veiculo_id: form.veiculo_id || null,
        motorista_id: form.motorista_id || null,
        descricao: up(form.descricao.trim()),
        observacoes: form.observacoes.trim() ? up(form.observacoes.trim()) : null,
      };
      const { error } = peca
        ? await supabase.from("pecas").insert({
            ...base,
            quantidade: Number(form.quantidade) || 1,
            valor_total: valor,
            fornecedor: form.fornecedor.trim() ? up(form.fornecedor.trim()) : null,
            nota_fiscal: form.nota_fiscal.trim() || null,
          })
        : await supabase.from("motorista_antecipacoes").insert({ ...base, motorista_id: form.motorista_id, valor });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(peca ? "Peça lançada" : "Antecipação lançada");
      qc.invalidateQueries({ queryKey: [tabela] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tabela).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [tabela] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const veicSel = veiculos.find((v) => v.id === form.veiculo_id);

  return (
    <PageShell
      icon={peca ? Package : HandCoins}
      title={peca ? "Peças" : "Descontos"}
      subtitle={
        peca
          ? "Peças compradas. Em placa de agregado, viram desconto no fechamento do motorista."
          : "Antecipações e descontos do motorista — saem como \"Antecipação\" no fechamento."
      }
      search={search}
      onSearch={setSearch}
      canAdd={staff}
      addLabel={peca ? "Nova peça" : "Novo desconto"}
      onAdd={() => { setForm(vazio); setOpen(true); }}
    >
      <Card className="divide-y divide-border/60">
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento.</div>
        ) : (
          filtrados.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{r.descricao}</span>
                  {r.veiculo?.agregado && <Badge variant="outline" className="text-[10px]">Agregado</Badge>}
                  {r.fechamento_id ? (
                    <Badge className="text-[10px]">Descontado no fechamento</Badge>
                  ) : (peca ? r.veiculo?.agregado : true) ? (
                    <Badge variant="secondary" className="text-[10px]">Desconto pendente</Badge>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.data.split("-").reverse().join("/")}
                  {r.veiculo?.placa ? ` · ${r.veiculo.placa}` : ""}
                  {r.motorista?.nome ? ` · ${r.motorista.nome}` : ""}
                  {r.quantidade && r.quantidade !== 1 ? ` · ${r.quantidade} un.` : ""}
                  {r.fornecedor ? ` · ${r.fornecedor}` : ""}
                  {r.nota_fiscal ? ` · NF ${r.nota_fiscal}` : ""}
                </div>
              </div>
              <span className="font-mono text-sm tabular-nums">{brl(r.valor)}</span>
              {staff && !r.fechamento_id && (
                <Button variant="ghost" size="icon" aria-label="Excluir"
                  onClick={() => confirm("Excluir este lançamento?") && excluir.mutate(r.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{peca ? "Lançar peça" : "Lançar antecipação / desconto"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Placa{peca ? "" : " (opcional)"}</Label>
              <Select value={form.veiculo_id || "none"} onValueChange={(v) => {
                const veiculo_id = v === "none" ? "" : v;
                const m = motoristas.find((x) => x.veiculo_id === veiculo_id);
                setForm({ ...form, veiculo_id, motorista_id: form.motorista_id || m?.id || "" });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {!peca && <SelectItem value="none">Sem placa</SelectItem>}
                  {veiculos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.placa}{v.agregado ? " · AGREGADO" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Motorista</Label>
              <Select value={form.motorista_id || "none"} onValueChange={(v) => setForm({ ...form, motorista_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {peca && <SelectItem value="none">Não informado</SelectItem>}
                  {motoristas.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">{peca ? "Peça (descrição)" : "Descrição"}</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: up(e.target.value) })}
                placeholder={peca ? "EX.: FILTRO DE ÓLEO PSL655" : "EX.: ADIANTAMENTO EM DINHEIRO"} />
            </div>
            {peca && (
              <div className="space-y-1.5">
                <Label className="text-xs">Quantidade</Label>
                <DecimalInput value={form.quantidade} onChange={(v) => setForm({ ...form, quantidade: String(v ?? "") })} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Valor total (R$)</Label>
              <DecimalInput value={form.valor} onChange={(v) => setForm({ ...form, valor: String(v ?? "") })} placeholder="0,00" />
            </div>
            {peca && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fornecedor</Label>
                  <Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: up(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nota fiscal</Label>
                  <Input value={form.nota_fiscal} onChange={(e) => setForm({ ...form, nota_fiscal: e.target.value })} />
                </div>
              </>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: up(e.target.value) })} />
            </div>
            {peca && veicSel && (
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {veicSel.agregado
                  ? "Placa de agregado: o valor será descontado no fechamento do motorista do período desta data."
                  : "Carro próprio: o valor entra no Contas a Pagar da empresa."}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
