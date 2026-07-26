import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type VeiculoDrilldownState = {
  veiculoId: string;
  placa: string;
  desde: string; // yyyy-mm-dd
} | null;

export function VeiculoDrilldownDialog({
  state,
  onOpenChange,
}: {
  state: VeiculoDrilldownState;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!state;

  const { data, isLoading } = useQuery({
    queryKey: ["veiculo-drilldown", state?.veiculoId, state?.desde],
    enabled: open,
    queryFn: async () => {
      const veiculoId = state!.veiculoId;
      const desde = state!.desde;
      const [lanc, viag, mot] = await Promise.all([
        supabase
          .from("financeiro_lancamentos")
          .select("id, tipo, valor, status, data_emissao, data_vencimento, data_pagamento, categoria, descricao")
          .eq("veiculo_id", veiculoId)
          .gte("data_emissao", desde)
          .order("data_emissao", { ascending: false }),
        supabase
          .from("viagens")
          .select("id, codigo, status, data_saida, data_chegada, km_inicial, km_final, valor_frete, motorista_id, origem_cidade, origem_uf, destino_cidade, destino_uf")
          .eq("veiculo_id", veiculoId)
          .or(`data_saida.gte.${desde},and(data_saida.is.null,created_at.gte.${desde})`)
          .order("data_saida", { ascending: false, nullsFirst: false }),

        supabase.from("motoristas").select("id, nome"),
      ]);
      const motMap = new Map((mot.data ?? []).map((m: { id: string; nome: string }) => [m.id, m.nome]));
      return {
        lancamentos: lanc.data ?? [],
        viagens: (viag.data ?? []).map((v) => ({ ...v, motorista_nome: motMap.get(v.motorista_id ?? "") ?? "—" })),
      };
    },
  });

  const totalDesp = data?.lancamentos.filter((l) => l.tipo === "pagar").reduce((s, l) => s + Number(l.valor ?? 0), 0) ?? 0;
  const totalRec = data?.lancamentos.filter((l) => l.tipo === "receber").reduce((s, l) => s + Number(l.valor ?? 0), 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{state?.placa ?? "—"}</DialogTitle>
          <DialogDescription>
            Lançamentos e viagens do veículo desde {state?.desde}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="grid min-h-[30vh] place-items-center">
            <Loader2 className="size-6 animate-spin text-brand" />
          </div>
        ) : (
          <Tabs defaultValue="lancamentos">
            <TabsList>
              <TabsTrigger value="lancamentos">
                Lançamentos ({data.lancamentos.length})
              </TabsTrigger>
              <TabsTrigger value="viagens">
                Viagens ({data.viagens.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lancamentos" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total a pagar</div>
                  <div className="mt-1 font-display text-lg font-bold text-destructive tabular-nums">{brl(totalDesp)}</div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total a receber</div>
                  <div className="mt-1 font-display text-lg font-bold text-brand tabular-nums">{brl(totalRec)}</div>
                </div>
              </div>
              <div className="max-h-[50vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.lancamentos.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Sem lançamentos.</TableCell></TableRow>
                    ) : data.lancamentos.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.data_vencimento ?? "—"}</TableCell>
                        <TableCell className="text-xs">{l.categoria ?? "—"}</TableCell>
                        <TableCell className="text-xs">{l.descricao ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={l.tipo === "receber" ? "default" : "secondary"}>{l.tipo}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{brl(Number(l.valor ?? 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="viagens">
              <div className="max-h-[55vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Saída</TableHead>
                      <TableHead>Rota</TableHead>
                      <TableHead>Motorista</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">KM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.viagens.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Sem viagens.</TableCell></TableRow>
                    ) : data.viagens.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono text-xs">
                          <Link to="/app/viagens/$id" params={{ id: v.id }} className="text-brand hover:underline">
                            {v.codigo ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">{v.data_saida?.slice(0, 10) ?? "—"}</TableCell>
                        <TableCell className="text-xs">{v.origem_cidade}/{v.origem_uf} → {v.destino_cidade}/{v.destino_uf}</TableCell>
                        <TableCell className="text-xs">{v.motorista_nome}</TableCell>
                        <TableCell><Badge variant="outline">{v.status}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0)).toLocaleString("pt-BR")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
