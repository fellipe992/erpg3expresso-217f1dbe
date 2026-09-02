import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCheck2, Loader2, Plus, Trash2, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import {
  cancelarFechamento,
  carregarViagensFechamento,
  confirmarFechamento,
  listarFechamentos,
  type DescontoExtra,
  type LinhaFechamento,
  type TipoFechamento,
} from "@/lib/fechamento";
import { brl, dt } from "@/lib/export-utils";
import { nnum } from "@/lib/frete";
import { RelatorioFechamentoDialog } from "@/components/fechamento/relatorio-fechamento";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/fechamento")({
  head: () => ({
    meta: [
      { title: "Fechamento de Viagens — G3 Expresso" },
      {
        name: "description",
        content: "Fechamento de viagens por cliente e por motorista, com geração automática de contas a receber e a pagar.",
      },
    ],
  }),
  component: FechamentoPage,
});

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDia = () => `${new Date().toISOString().slice(0, 7)}-01`;

function FechamentoPage() {
  const { role } = useAuth();
  const permitido = role === "administrador" || role === "gestor" || role === "financeiro";

  if (!permitido) {
    return (
      <PageShell icon={FileCheck2} title="Fechamento" subtitle="Acesso restrito">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Este módulo está disponível apenas para a equipe administrativa e financeira.
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell icon={FileCheck2} title="Fechamento de viagens" subtitle="Fature clientes e pague motoristas por período">
      <Tabs defaultValue="cliente">
        <TabsList>
          <TabsTrigger value="cliente">Por cliente</TabsTrigger>
          <TabsTrigger value="motorista">Por motorista</TabsTrigger>
          <TabsTrigger value="historico">Fechamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="cliente" className="pt-3">
          <PainelFechamento tipo="cliente" />
        </TabsContent>
        <TabsContent value="motorista" className="pt-3">
          <PainelFechamento tipo="motorista" />
        </TabsContent>
        <TabsContent value="historico" className="pt-3">
          <Historico />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function PainelFechamento({ tipo }: { tipo: TipoFechamento }) {
  const qc = useQueryClient();
  const [de, setDe] = useState(primeiroDia());
  const [ate, setAte] = useState(hoje());
  const [clienteId, setClienteId] = useState<string>("");
  const [motoristaId, setMotoristaId] = useState<string>("");
  const [veiculoId, setVeiculoId] = useState<string>("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [abrirConfirmacao, setAbrirConfirmacao] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, razao_social").order("razao_social");
      return (data ?? []) as { id: string; razao_social: string }[];
    },
  });
  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("id, nome").order("nome");
      return (data ?? []) as { id: string; nome: string }[];
    },
  });
  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("veiculos").select("id, placa").order("placa");
      return (data ?? []) as { id: string; placa: string }[];
    },
  });

  const filtros = {
    de,
    ate,
    clienteId: clienteId || null,
    motoristaId: motoristaId || null,
    veiculoId: veiculoId || null,
  };

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["fechamento-viagens", tipo, filtros],
    queryFn: () => carregarViagensFechamento(tipo, filtros),
  });

  const disponiveis = linhas.filter((l) => l.fechamentoNumero == null);
  const selecionadas = useMemo(() => disponiveis.filter((l) => sel[l.viagemId]), [disponiveis, sel]);
  const totalSelecionado = selecionadas.reduce((s, l) => s + l.total, 0);

  const alvoDefinido = tipo === "cliente" ? !!clienteId : !!motoristaId;

  return (
    <div className="space-y-4">
      <Card className="grid gap-3 p-3 md:grid-cols-5 md:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">De</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cliente{tipo === "cliente" ? " *" : ""}</Label>
          <Select value={clienteId || "todos"} onValueChange={(v) => setClienteId(v === "todos" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Motorista{tipo === "motorista" ? " *" : ""}</Label>
          <Select value={motoristaId || "todos"} onValueChange={(v) => setMotoristaId(v === "todos" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {motoristas.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Veículo</Label>
          <Select value={veiculoId || "todos"} onValueChange={(v) => setVeiculoId(v === "todos" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {veiculos.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.placa}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="grid place-items-center p-10"><Loader2 className="size-5 animate-spin text-brand" /></div>
        ) : linhas.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma viagem encontrada para os filtros informados.
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-left">
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    checked={disponiveis.length > 0 && selecionadas.length === disponiveis.length}
                    onCheckedChange={(v) =>
                      setSel(v ? Object.fromEntries(disponiveis.map((l) => [l.viagemId, true])) : {})
                    }
                  />
                </th>
                <th className="px-3 py-2 font-semibold">OS</th>
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 font-semibold">{tipo === "cliente" ? "Cliente" : "Motorista"}</th>
                <th className="px-3 py-2 font-semibold">Placa</th>
                <th className="px-3 py-2 font-semibold">Rota</th>
                <th className="px-3 py-2 font-semibold">Raio</th>
                <th className="px-3 py-2 text-right font-semibold">Frete</th>
                <th className="px-3 py-2 text-right font-semibold">Pedágio</th>
                <th className="px-3 py-2 text-right font-semibold">Adic.</th>
                <th className="px-3 py-2 text-right font-semibold">Desc.</th>
                <th className="px-3 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const fechada = l.fechamentoNumero != null;
                return (
                  <tr key={l.viagemId} className="border-b border-border/40 last:border-0">
                    <td className="px-3 py-2">
                      {fechada ? (
                        <Badge variant="outline">#{l.fechamentoNumero}</Badge>
                      ) : (
                        <Checkbox
                          checked={!!sel[l.viagemId]}
                          onCheckedChange={(v) => setSel({ ...sel, [l.viagemId]: !!v })}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{l.codigo ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dt(l.data)}</td>
                    <td className="px-3 py-2">{tipo === "cliente" ? l.cliente : l.motorista}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.placa}</td>
                    <td className="px-3 py-2 text-xs">{l.origem} → {l.destino}</td>
                    <td className="px-3 py-2 text-xs">{l.raio}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{brl(l.frete)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{brl(l.pedagio)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{brl(l.adicionais)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-destructive">
                      {brl(l.descontos)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{brl(l.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm">
          <span className="text-muted-foreground">{selecionadas.length} viagem(ns) selecionada(s) · total </span>
          <span className="font-mono font-semibold tabular-nums">{brl(totalSelecionado)}</span>
        </div>
        <Button
          disabled={!selecionadas.length}
          onClick={() => {
            if (!alvoDefinido) {
              return toast.error(
                tipo === "cliente"
                  ? "Selecione um cliente no filtro para faturar."
                  : "Selecione um motorista no filtro para pagar.",
              );
            }
            setAbrirConfirmacao(true);
          }}
        >
          {tipo === "cliente" ? "Gerar fatura do cliente" : "Gerar pagamento do motorista"}
        </Button>
      </Card>

      <DialogConfirmar
        tipo={tipo}
        open={abrirConfirmacao}
        onOpenChange={setAbrirConfirmacao}
        linhas={selecionadas}
        periodo={{ de, ate }}
        clienteId={tipo === "cliente" ? clienteId : clienteId || null}
        motoristaId={tipo === "motorista" ? motoristaId : motoristaId || null}
        veiculoId={veiculoId || null}
        nome={
          tipo === "cliente"
            ? (clientes.find((c) => c.id === clienteId)?.razao_social ?? "")
            : (motoristas.find((m) => m.id === motoristaId)?.nome ?? "")
        }
        onDone={() => {
          setSel({});
          setAbrirConfirmacao(false);
          qc.invalidateQueries({ queryKey: ["fechamento-viagens"] });
          qc.invalidateQueries({ queryKey: ["fechamentos"] });
          qc.invalidateQueries({ queryKey: ["lancamentos"] });
        }}
      />
    </div>
  );
}

function DialogConfirmar({
  tipo,
  open,
  onOpenChange,
  linhas,
  periodo,
  clienteId,
  motoristaId,
  veiculoId,
  nome,
  onDone,
}: {
  tipo: TipoFechamento;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  linhas: LinhaFechamento[];
  periodo: { de: string; ate: string };
  clienteId: string | null;
  motoristaId: string | null;
  veiculoId: string | null;
  nome: string;
  onDone: () => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [extras, setExtras] = useState<DescontoExtra[]>([]);
  const [novoExtra, setNovoExtra] = useState({ descricao: "", valor: "" });

  const valorViagens = linhas.reduce((s, l) => s + l.total, 0);
  const totalExtras = extras.reduce((s, e) => s + e.valor, 0);
  const sugestao = `${tipo === "cliente" ? "Fatura" : "Pagamento"} ${nome} — ${dt(periodo.de)} a ${dt(periodo.ate)} (${linhas.length} viagens)`;

  const gerar = useMutation({
    mutationFn: () =>
      confirmarFechamento({
        tipo,
        linhas,
        descricao: descricao.trim() || sugestao,
        vencimento: vencimento || null,
        periodo,
        descontosExtras: extras,
        clienteId,
        motoristaId,
        veiculoId,
      }),
    onSuccess: (f) => {
      toast.success(`Fechamento #${f.numero} gerado`, {
        description:
          tipo === "cliente"
            ? "Conta a receber criada e lançamentos individuais consolidados."
            : "Conta a pagar criada para o motorista.",
      });
      setExtras([]);
      setDescricao("");
      setVencimento("");
      onDone();
    },
    onError: (e: Error) => toast.error("Não foi possível gerar o fechamento", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tipo === "cliente" ? "Gerar fatura do cliente" : "Gerar pagamento do motorista"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 p-3 text-sm">
            <div className="font-semibold">{nome || "—"}</div>
            <div className="text-muted-foreground">
              {dt(periodo.de)} a {dt(periodo.ate)} · {linhas.length} viagem(ns)
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição do lançamento</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={sugestao} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Vencimento</Label>
            <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Descontos / acertos deste fechamento
            </div>
            {extras.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{e.descricao}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums text-destructive">{brl(e.valor)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </span>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Input
                value={novoExtra.descricao}
                onChange={(ev) => setNovoExtra({ ...novoExtra, descricao: ev.target.value })}
                placeholder="Ex.: Adiantamento"
              />
              <DecimalInput
                value={novoExtra.valor}
                onChange={(v) => setNovoExtra({ ...novoExtra, valor: v })}
                placeholder="0,00"
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (!novoExtra.descricao.trim() || nnum(novoExtra.valor) <= 0) {
                    return toast.error("Informe descrição e valor do desconto.");
                  }
                  setExtras([...extras, { descricao: novoExtra.descricao.trim(), valor: nnum(novoExtra.valor) }]);
                  setNovoExtra({ descricao: "", valor: "" });
                }}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
            <Linha label="Total das viagens" valor={brl(valorViagens)} />
            <Linha label="(-) Descontos do fechamento" valor={brl(totalExtras)} />
            <Linha label={tipo === "cliente" ? "Valor a receber" : "Valor a pagar"} valor={brl(valorViagens - totalExtras)} forte />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => gerar.mutate()} disabled={gerar.isPending || !linhas.length}>
            {gerar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Confirmar fechamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ label, valor, forte }: { label: string; valor: string; forte?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${forte ? "font-semibold" : ""}`}>
      <span className={forte ? "" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono tabular-nums">{valor}</span>
    </div>
  );
}

function Historico() {
  const qc = useQueryClient();
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({ queryKey: ["fechamentos"], queryFn: listarFechamentos });

  const cancelar = useMutation({
    mutationFn: cancelarFechamento,
    onSuccess: () => {
      toast.success("Fechamento cancelado. As viagens voltaram a estar disponíveis.");
      qc.invalidateQueries({ queryKey: ["fechamentos"] });
      qc.invalidateQueries({ queryKey: ["fechamento-viagens"] });
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
    },
    onError: (e: Error) => toast.error("Não foi possível cancelar", { description: e.message }),
  });

  if (isLoading) {
    return <div className="grid place-items-center p-10"><Loader2 className="size-5 animate-spin text-brand" /></div>;
  }
  if (!data.length) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum fechamento gerado ainda.</Card>;
  }

  return (
    <>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40 text-left">
              <th className="px-3 py-2 font-semibold">Nº</th>
              <th className="px-3 py-2 font-semibold">Tipo</th>
              <th className="px-3 py-2 font-semibold">Beneficiário</th>
              <th className="px-3 py-2 font-semibold">Período</th>
              <th className="px-3 py-2 font-semibold">Vencimento</th>
              <th className="px-3 py-2 text-right font-semibold">Valor</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data.map((f) => (
              <tr key={f.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-2 font-mono">#{f.numero}</td>
                <td className="px-3 py-2">{f.tipo === "cliente" ? "Cliente" : "Motorista"}</td>
                <td className="px-3 py-2">{f.cliente?.razao_social ?? f.motorista?.nome ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {dt(f.periodo_inicio)} a {dt(f.periodo_fim)}
                </td>
                <td className="px-3 py-2 text-xs">{dt(f.vencimento)}</td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{brl(Number(f.valor))}</td>
                <td className="px-3 py-2">
                  <Badge variant={f.status === "cancelado" ? "outline" : "default"}>{f.status}</Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Button variant="outline" size="sm" onClick={() => setDetalhe(f.id)}>Ver</Button>
                  {f.status !== "cancelado" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Cancelar fechamento"
                      onClick={() =>
                        confirm(`Cancelar o fechamento #${f.numero}? As viagens ficam livres novamente.`) &&
                        cancelar.mutate(f.id)
                      }
                    >
                      <XCircle className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <RelatorioFechamentoDialog fechamentoId={detalhe} open={!!detalhe} onOpenChange={(v) => !v && setDetalhe(null)} />
    </>
  );
}
