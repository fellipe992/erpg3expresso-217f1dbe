import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileStack, ListChecks, Loader2, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  cancelarFatura,
  carregarItensFatura,
  gerarFatura,
  itemElegivel,
  listarFaturas,
  resumirFatura,
  type TipoFatura,
} from "@/lib/fatura-fornecedor";

const brl = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const TODOS = "__todos__";

/** Botões "Fechar fatura" e "Faturas geradas" das telas de Abastecimentos e Peças. */
export function FaturaFornecedorPanel({ tipo }: { tipo: TipoFatura }) {
  const [abrirFechar, setAbrirFechar] = useState(false);
  const [abrirLista, setAbrirLista] = useState(false);
  const rotulo = tipo === "abastecimento" ? "posto" : "fornecedor";
  return (
    <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
      <div className="text-sm text-muted-foreground">
        Junte os {tipo === "abastecimento" ? "abastecimentos" : "lançamentos de peças"} de um período numa fatura única do {rotulo}, enviada ao Contas a Pagar.
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setAbrirLista(true)}>
          <ListChecks className="size-4" /> Faturas geradas
        </Button>
        <Button size="sm" onClick={() => setAbrirFechar(true)}>
          <FileStack className="size-4" /> Fechar fatura
        </Button>
      </div>
      <FecharFaturaDialog tipo={tipo} open={abrirFechar} onOpenChange={setAbrirFechar} />
      <ListaFaturasDialog tipo={tipo} open={abrirLista} onOpenChange={setAbrirLista} />
    </Card>
  );
}

function FecharFaturaDialog({ tipo, open, onOpenChange }: { tipo: TipoFatura; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState<{ de: string; ate: string } | null>(null);
  const [fornecedor, setFornecedor] = useState(TODOS);
  const [vencimento, setVencimento] = useState("");
  const [descricao, setDescricao] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());

  const { data: itens = [], isFetching } = useQuery({
    queryKey: ["fatura-itens", tipo, busca?.de, busca?.ate],
    enabled: open && !!busca,
    queryFn: () => carregarItensFatura(tipo, busca!.de, busca!.ate),
  });
  const fornecedores = useMemo(
    () => Array.from(new Set(itens.map((i) => i.fornecedor).filter((f): f is string => !!f))).sort(),
    [itens],
  );
  const visiveis = useMemo(
    () => itens.filter((i) => fornecedor === TODOS || i.fornecedor === fornecedor),
    [itens, fornecedor],
  );
  useEffect(() => {
    setSel(new Set(visiveis.filter(itemElegivel).map((i) => i.id)));
  }, [visiveis]);
  useEffect(() => {
    if (fornecedores.length === 1) setFornecedor(fornecedores[0]);
  }, [fornecedores]);

  const { escolhidos, total } = resumirFatura(visiveis, sel);
  const nomeForn = fornecedor === TODOS ? null : fornecedor;
  const sugestao = `FATURA ${tipo === "abastecimento" ? "POSTO" : "PEÇAS"}${nomeForn ? ` ${nomeForn.toUpperCase()}` : ""} — ${dt(busca?.de)} A ${dt(busca?.ate)} (${escolhidos.length} ITENS)`;
  const jaPagos = visiveis.filter((i) => !itemElegivel(i)).length;

  const gerar = useMutation({
    mutationFn: () =>
      gerarFatura({
        tipo,
        periodo: busca!,
        fornecedor: nomeForn,
        vencimento,
        descricao: (descricao.trim() || sugestao).toUpperCase(),
        itens: escolhidos,
      }),
    onSuccess: (f) => {
      toast.success(`Fatura #${f.numero} gerada`, { description: `${brl(total)} no Contas a Pagar, vencimento ${dt(vencimento)}.` });
      for (const k of ["fatura-itens", "faturas-fornecedor", "financeiro", tipo === "abastecimento" ? "abastecimentos" : "pecas"])
        qc.invalidateQueries({ queryKey: [k] });
      setBusca(null);
      setDescricao("");
      setVencimento("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Não foi possível gerar a fatura", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fechar fatura de {tipo === "abastecimento" ? "posto" : "peças"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label className="text-xs">Compras de</Label>
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Até</Label>
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
            <Button className="self-end" variant="outline" disabled={!de || !ate || de > ate} onClick={() => { setFornecedor(TODOS); setBusca({ de, ate }); }}>
              <Search className="size-4" /> Buscar
            </Button>
          </div>

          {busca && (
            <>
              {fornecedores.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">{tipo === "abastecimento" ? "Posto" : "Fornecedor"}</Label>
                  <Select value={fornecedor} onValueChange={setFornecedor}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TODOS}>Todos</SelectItem>
                      {fornecedores.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="rounded-lg border border-border/60">
                {isFetching ? (
                  <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-brand" /></div>
                ) : visiveis.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Nada em aberto neste período.</div>
                ) : (
                  <div className="max-h-[40vh] divide-y divide-border/60 overflow-y-auto">
                    <label className="flex items-center gap-3 bg-muted/40 p-2 text-xs font-semibold">
                      <Checkbox
                        checked={escolhidos.length > 0 && escolhidos.length === visiveis.filter(itemElegivel).length}
                        onCheckedChange={(v) => setSel(v ? new Set(visiveis.filter(itemElegivel).map((i) => i.id)) : new Set())}
                      />
                      Selecionar todos
                    </label>
                    {visiveis.map((i) => {
                      const ok = itemElegivel(i);
                      return (
                        <label key={i.id} className={`flex items-center gap-3 p-2 text-sm ${ok ? "" : "opacity-50"}`}>
                          <Checkbox
                            disabled={!ok}
                            checked={sel.has(i.id) && ok}
                            onCheckedChange={(v) => {
                              const n = new Set(sel);
                              if (v) n.add(i.id); else n.delete(i.id);
                              setSel(n);
                            }}
                          />
                          <span className="w-12 shrink-0 text-xs text-muted-foreground">{dt(i.data).slice(0, 5)}</span>
                          <span className="min-w-0 flex-1 truncate">
                            {i.descricao}
                            <span className="text-xs text-muted-foreground">
                              {i.placa ? ` · ${i.placa}` : ""}{i.fornecedor ? ` · ${i.fornecedor}` : ""}
                            </span>
                          </span>
                          {!ok && <Badge variant="outline" className="text-[10px]">já pago</Badge>}
                          <span className="font-mono tabular-nums">{brl(i.valor)}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {jaPagos > 0 && (
                <p className="text-xs text-muted-foreground">{jaPagos} item(ns) já pagos individualmente ficam fora da fatura.</p>
              )}

              <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
                <div className="space-y-1">
                  <Label className="text-xs">Descrição da conta a pagar</Label>
                  <Input value={descricao} onChange={(e) => setDescricao(e.target.value.toUpperCase())} placeholder={sugestao} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vencimento *</Label>
                  <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-between rounded-lg bg-muted/40 p-3 text-sm font-semibold">
                <span>{escolhidos.length} item(ns) selecionado(s)</span>
                <span className="font-mono tabular-nums">{brl(total)}</span>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button disabled={!busca || !escolhidos.length || !vencimento || gerar.isPending} onClick={() => gerar.mutate()}>
            {gerar.isPending && <Loader2 className="size-4 animate-spin" />} Gerar fatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListaFaturasDialog({ tipo, open, onOpenChange }: { tipo: TipoFatura; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["faturas-fornecedor", tipo],
    enabled: open,
    queryFn: () => listarFaturas(tipo),
  });
  const cancelar = useMutation({
    mutationFn: cancelarFatura,
    onSuccess: () => {
      toast.success("Fatura cancelada", { description: "Os itens voltaram a ficar em aberto." });
      for (const k of ["fatura-itens", "faturas-fornecedor", "financeiro", tipo === "abastecimento" ? "abastecimentos" : "pecas"])
        qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Faturas geradas</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-brand" /></div>
        ) : data.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma fatura gerada.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {data.map((f) => {
              const paga = f.lancamento?.status === "pago";
              return (
                <div key={f.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      #{f.numero} {f.fornecedor ?? "Vários"}
                      {f.status === "cancelada" ? (
                        <Badge variant="outline">Cancelada</Badge>
                      ) : paga ? (
                        <Badge>Paga</Badge>
                      ) : (
                        <Badge variant="secondary">Em aberto</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dt(f.periodo_inicio)} a {dt(f.periodo_fim)} · {f.quantidade_itens} item(ns) · vence {dt(f.vencimento)}
                    </div>
                  </div>
                  <span className="font-mono tabular-nums">{brl(f.valor)}</span>
                  {f.status !== "cancelada" && !paga && (
                    <Button variant="ghost" size="sm" disabled={cancelar.isPending}
                      onClick={() => confirm(`Cancelar a fatura #${f.numero}? Os itens voltam a ficar em aberto.`) && cancelar.mutate(f.id)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
