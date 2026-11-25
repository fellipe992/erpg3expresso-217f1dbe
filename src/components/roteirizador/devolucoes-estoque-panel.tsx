import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PackageCheck, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DevolucaoDialog } from "@/components/viagem/devolucao-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { StatusEntrega, StatusParadaProjeto } from "@/lib/devolucoes";
import { cn } from "@/lib/utils";

type ItemDevolucaoRow = {
  id: string;
  viagem_id: string;
  parada_id: string;
  tipo: string;
  item_descricao: string;
  quantidade: number;
  unidade: string | null;
  motivo: string;
  observacoes: string | null;
  conferido_estoque: boolean;
  created_at: string;
  parada: { cliente: string | null; endereco: string; nf: string | null } | null;
  viagem: { codigo: string | null } | null;
};

const LABEL_STATUS: Record<StatusEntrega, { texto: string; classe: string; ponto: string }> = {
  entregue: {
    texto: "Concluída",
    classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    ponto: "bg-emerald-500",
  },
  devolucao_parcial: {
    texto: "Dev. parcial",
    classe: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    ponto: "bg-orange-500",
  },
  devolucao_total: {
    texto: "Dev. total (re-roteirizar)",
    classe: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
    ponto: "bg-red-500",
  },
  pendente: {
    texto: "Em rota / Pendente",
    classe: "border-border bg-muted text-muted-foreground",
    ponto: "bg-muted-foreground/40",
  },
};

export function DevolucoesEstoquePanel({
  projetoId,
  paradasProjeto,
  onReoteirizarDevolucoes,
}: {
  projetoId: string | null;
  paradasProjeto: StatusParadaProjeto[];
  onReoteirizarDevolucoes: (devolvidasOrigemIds: string[]) => void;
}) {
  const qc = useQueryClient();
  const [paradaAlvo, setParadaAlvo] = useState<StatusParadaProjeto | null>(null);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);

  const { data: itensDevolvidos = [] } = useQuery({
    queryKey: ["roteirizador-devolucoes", projetoId],
    queryFn: async (): Promise<ItemDevolucaoRow[]> => {
      let q = supabase
        .from("viagem_parada_devolucoes")
        .select(
          "id, viagem_id, parada_id, tipo, item_descricao, quantidade, unidade, motivo, observacoes, conferido_estoque, created_at, parada:parada_id(cliente, endereco, nf), viagem:viagem_id(codigo)",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (projetoId) q = q.eq("projeto_roteirizacao_id", projetoId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ItemDevolucaoRow[];
    },
  });

  const concluidas = paradasProjeto.filter((p) => p.statusEntrega === "entregue").length;
  const parciais = paradasProjeto.filter((p) => p.statusEntrega === "devolucao_parcial").length;
  const totais = paradasProjeto.filter((p) => p.statusEntrega === "devolucao_total");
  const pendentes = paradasProjeto.filter((p) => p.statusEntrega === "pendente").length;

  const darBaixa = async (p: StatusParadaProjeto) => {
    setSalvandoId(p.paradaId);
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from("viagem_paradas")
      .update({ status_entrega: "entregue", entregue_em: agora })
      .eq("id", p.paradaId);
    setSalvandoId(null);
    if (error) {
      toast.error("Erro ao dar baixa na entrega", { description: error.message });
      return;
    }
    toast.success("Entrega concluída");
    qc.invalidateQueries({ queryKey: ["roteirizador-paradas", projetoId] });
  };

  const alternarConferencia = async (item: ItemDevolucaoRow) => {
    const novo = !item.conferido_estoque;
    const { data: sessao } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("viagem_parada_devolucoes")
      .update({
        conferido_estoque: novo,
        conferido_em: novo ? new Date().toISOString() : null,
        conferido_por: novo ? (sessao.user?.id ?? null) : null,
      })
      .eq("id", item.id);
    if (error) {
      toast.error("Erro ao atualizar conferência", { description: error.message });
      return;
    }
    qc.invalidateQueries({ queryKey: ["roteirizador-devolucoes", projetoId] });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Concluídas (100%)</p>
          <p className="text-2xl font-bold text-emerald-600">{concluidas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Devolução parcial</p>
          <p className="text-2xl font-bold text-orange-600">{parciais}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Devolução total (voltam p/ rota)</p>
          <p className="text-2xl font-bold text-red-600">{totais.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Em rota / Pendentes</p>
          <p className="text-2xl font-bold">{pendentes}</p>
        </Card>
      </div>

      {totais.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-red-500/40 bg-red-500/5 p-4">
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">
              {totais.length} entrega(s) voltaram 100% e estão prontas para re-roteirização
            </p>
            <p className="text-xs text-muted-foreground">
              O otimizador aloca nos roteiros que ainda não saíram para a rua e rebalanceia paradas se algum veículo atingir o limite.
            </p>
          </div>
          <Button
            onClick={() =>
              onReoteirizarDevolucoes(
                totais.map((t) => t.entregaOrigemId).filter((id): id is string => Boolean(id)),
              )
            }
          >
            <RefreshCw className="mr-2 size-4" />
            Re-roteirizar devoluções ({totais.length})
          </Button>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Relatório de retorno ao estoque</h3>
            <Badge variant="outline">{itensDevolvidos.length} registro(s)</Badge>
          </div>
          {!itensDevolvidos.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum produto devolvido registrado para este roteiro.
            </p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {itensDevolvidos.map((it) => (
                <div
                  key={it.id}
                  className={cn(
                    "flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-xs",
                    it.conferido_estoque ? "border-emerald-500/30 bg-emerald-500/5" : "border-border",
                  )}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          it.tipo === "total"
                            ? "border-red-500/40 bg-red-500/10 text-red-600"
                            : "border-orange-500/40 bg-orange-500/10 text-orange-600"
                        }
                      >
                        {it.tipo === "total" ? "Total" : "Parcial"}
                      </Badge>
                      <span className="font-semibold">
                        {it.quantidade} {it.unidade ?? "UN"} · {it.item_descricao}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      {it.parada?.cliente || it.parada?.endereco || "Cliente"}
                      {it.parada?.nf ? ` · NF ${it.parada.nf}` : ""}
                      {it.viagem?.codigo ? ` · Viagem ${it.viagem.codigo}` : ""}
                    </p>
                    <p className="text-muted-foreground">Motivo: {it.motivo}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={it.conferido_estoque ? "default" : "outline"}
                    className={cn("h-7 text-xs", it.conferido_estoque && "bg-emerald-600 hover:bg-emerald-700")}
                    onClick={() => alternarConferencia(it)}
                  >
                    <CheckCircle2 className="mr-1 size-3.5" />
                    {it.conferido_estoque ? "No estoque" : "Confirmar estoque"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Baixa e status das entregas despachadas</h3>
            <Badge variant="outline">{paradasProjeto.length} parada(s)</Badge>
          </div>
          {!paradasProjeto.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Despache as rotas deste projeto para acompanhar e dar baixa nas entregas aqui.
            </p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {paradasProjeto.map((p) => {
                const cfg = LABEL_STATUS[p.statusEntrega];
                return (
                  <div key={p.paradaId} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-xs">
                    <span className={cn("size-2.5 shrink-0 rounded-full", cfg.ponto)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {p.cliente || p.endereco}
                        {p.nf ? ` · NF ${p.nf}` : ""}
                      </p>
                      {p.motivoDevolucao && (
                        <p className="truncate text-[11px] text-muted-foreground">{p.motivoDevolucao}</p>
                      )}
                    </div>
                    <Badge variant="outline" className={cn("text-[10px]", cfg.classe)}>
                      {cfg.texto}
                    </Badge>
                    {p.statusEntrega === "pendente" && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-emerald-600"
                          disabled={salvandoId === p.paradaId}
                          onClick={() => darBaixa(p)}
                        >
                          <PackageCheck className="mr-1 size-3.5" /> Baixar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-orange-600"
                          onClick={() => setParadaAlvo(p)}
                        >
                          <RotateCcw className="mr-1 size-3.5" /> Devolução
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <DevolucaoDialog
        open={Boolean(paradaAlvo)}
        onOpenChange={(v) => { if (!v) setParadaAlvo(null); }}
        viagemId={paradaAlvo?.viagemId ?? ""}
        parada={
          paradaAlvo
            ? {
                id: paradaAlvo.paradaId,
                cliente: paradaAlvo.cliente,
                endereco: paradaAlvo.endereco,
                nf: paradaAlvo.nf,
                projeto_roteirizacao_id: projetoId,
              }
            : null
        }
        onSalvo={() => {
          qc.invalidateQueries({ queryKey: ["roteirizador-paradas", projetoId] });
          qc.invalidateQueries({ queryKey: ["roteirizador-devolucoes", projetoId] });
        }}
      />
    </div>
  );
}