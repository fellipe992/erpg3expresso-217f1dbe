import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KanbanSquare, Loader2, Pencil, TrendingUp, Target, Trophy } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  brl,
  useClientesSimples,
  useCrmEtapas,
  useCrmOportunidades,
  useUsuariosInternos,
  type CrmOportunidade,
} from "@/hooks/use-crm";
import { PageShell } from "@/components/crud/page-shell";
import { OportunidadeDialog } from "@/components/crm/oportunidade-dialog";
import { CrmTimeline } from "@/components/crm/crm-timeline";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app/crm/funil")({
  head: () => ({
    meta: [
      { title: "Funil de vendas — G3 Expresso" },
      { name: "description", content: "Acompanhe as oportunidades comerciais da G3 Expresso por etapa do funil." },
    ],
  }),
  component: FunilPage,
});

function FunilPage() {
  const qc = useQueryClient();
  const { data: etapas = [] } = useCrmEtapas();
  const { data: oportunidades = [], isLoading } = useCrmOportunidades();
  const { data: clientes = [] } = useClientesSimples();
  const { data: usuarios = [] } = useUsuariosInternos();

  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editando, setEditando] = useState<Partial<CrmOportunidade> | null>(null);
  const [detalhe, setDetalhe] = useState<CrmOportunidade | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);

  const nomeCliente = (id: string | null) =>
    clientes.find((c) => c.id === id)?.nome_fantasia ||
    clientes.find((c) => c.id === id)?.razao_social ||
    null;
  const nomeUsuario = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? null;

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return oportunidades;
    return oportunidades.filter(
      (o) =>
        o.titulo.toLowerCase().includes(q) ||
        (nomeCliente(o.cliente_id) ?? "").toLowerCase().includes(q) ||
        (o.contato_nome ?? "").toLowerCase().includes(q),
    );
  }, [oportunidades, search, clientes]);

  const abertas = filtradas.filter((o) => etapas.find((e) => e.id === o.etapa_id)?.tipo === "aberta");
  const totalPipeline = abertas.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
  const ponderado = abertas.reduce((s, o) => s + (Number(o.valor_estimado || 0) * Number(o.probabilidade || 0)) / 100, 0);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const ganhoMes = filtradas
    .filter((o) => etapas.find((e) => e.id === o.etapa_id)?.tipo === "ganho" && (o.fechada_em ?? "").startsWith(mesAtual))
    .reduce((s, o) => s + Number(o.valor_fechado ?? o.valor_estimado ?? 0), 0);

  const mover = useMutation({
    mutationFn: async ({ id, etapaId }: { id: string; etapaId: string }) => {
      const etapa = etapas.find((e) => e.id === etapaId);
      const fechada = etapa && etapa.tipo !== "aberta" ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("crm_oportunidades")
        .update({ etapa_id: etapaId, fechada_em: fechada })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-oportunidades"] });
      qc.invalidateQueries({ queryKey: ["crm-timeline"] });
      toast.success("Oportunidade movida");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  return (
    <PageShell
      icon={KanbanSquare}
      title="Funil de vendas"
      subtitle="Arraste os cards entre as etapas para atualizar o status"
      search={search}
      onSearch={setSearch}
      addLabel="Nova oportunidade"
      onAdd={() => {
        setEditando(null);
        setEditOpen(true);
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi icon={TrendingUp} label="Pipeline em aberto" value={brl(totalPipeline)} hint={`${abertas.length} oportunidades`} />
        <Kpi icon={Target} label="Valor ponderado" value={brl(ponderado)} hint="Ajustado pela probabilidade" />
        <Kpi icon={Trophy} label="Ganho no mês" value={brl(ganhoMes)} hint="Negócios fechados" />
      </div>

      {isLoading ? (
        <div className="grid place-items-center p-12">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {etapas.map((etapa) => {
            const itens = filtradas.filter((o) => o.etapa_id === etapa.id);
            const total = itens.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
            return (
              <div
                key={etapa.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (arrastando) {
                    const atual = oportunidades.find((o) => o.id === arrastando);
                    if (atual && atual.etapa_id !== etapa.id) mover.mutate({ id: arrastando, etapaId: etapa.id });
                  }
                  setArrastando(null);
                }}
                className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: etapa.cor }} />
                  <span className="text-sm font-medium">{etapa.nome}</span>
                  <Badge variant="outline" className="ml-auto text-[10px]">{itens.length}</Badge>
                </div>
                <div className="px-3 py-1 text-xs text-muted-foreground">{brl(total)}</div>
                <div className="flex flex-1 flex-col gap-2 p-2">
                  {itens.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      draggable
                      onDragStart={() => setArrastando(o.id)}
                      onDragEnd={() => setArrastando(null)}
                      onClick={() => setDetalhe(o)}
                      className="rounded-md border bg-card p-3 text-left shadow-sm transition hover:border-brand"
                    >
                      <div className="text-sm font-medium leading-tight">{o.titulo}</div>
                      {nomeCliente(o.cliente_id) && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{nomeCliente(o.cliente_id)}</div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-brand">{brl(o.valor_estimado)}</span>
                        <Badge variant="outline" className="text-[10px]">{o.probabilidade}%</Badge>
                      </div>
                      {nomeUsuario(o.responsavel_id) && (
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">
                          {nomeUsuario(o.responsavel_id)}
                        </div>
                      )}
                    </button>
                  ))}
                  {itens.length === 0 && (
                    <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Sem oportunidades
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OportunidadeDialog open={editOpen} onOpenChange={setEditOpen} oportunidade={editando} />

      <Dialog open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detalhe?.titulo}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditando(detalhe);
                  setDetalhe(null);
                  setEditOpen(true);
                }}
              >
                <Pencil className="size-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <Info label="Valor" value={brl(detalhe.valor_estimado)} />
                <Info label="Probabilidade" value={`${detalhe.probabilidade}%`} />
                <Info label="Cliente" value={nomeCliente(detalhe.cliente_id) ?? "—"} />
                <Info label="Responsável" value={nomeUsuario(detalhe.responsavel_id) ?? "—"} />
                <Info
                  label="Previsão"
                  value={detalhe.data_prevista ? new Date(detalhe.data_prevista + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                />
                <Info label="Origem" value={detalhe.origem ?? "—"} />
              </div>
              {detalhe.descricao && <p className="text-sm text-muted-foreground">{detalhe.descricao}</p>}
              <CrmTimeline oportunidadeId={detalhe.id} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid size-10 place-items-center rounded-lg bg-brand-subtle">
          <Icon className="size-5 text-brand" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
