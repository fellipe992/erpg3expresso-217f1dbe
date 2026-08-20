import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  Loader2,
  Percent,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHideValues, HideValuesToggle } from "@/hooks/use-hide-values";
import { KpiCard, SecaoVazia } from "@/components/relatorios/kpi-card";
import {
  FiltrosFinanceiros,
  selecionado,
  rotuloSelecao,
  filtrosIniciais,
  statusCombina,
  hojeLocal,
  type FiltrosFin,
} from "@/components/relatorios/filtros-financeiros";
import { categoriaDespesa, rotuloMes, useBiDados, type LancBi } from "@/hooks/use-bi-dados";
import { brl, dt, exportarExcel, exportarPdf, pct } from "@/lib/export-utils";

export const Route = createFileRoute("/_authenticated/app/financeiro")({
  head: () => ({
    meta: [
      { title: "Dashboard Financeiro — G3 Expresso" },
      { name: "description", content: "Faturamento, despesas, lucro líquido e inadimplência da operação G3 Expresso." },
      { property: "og:title", content: "Dashboard Financeiro — G3 Expresso" },
      { property: "og:description", content: "Visão consolidada de receitas, despesas e resultado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceiroPage,
});

const CORES = [
  "var(--color-brand)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-3)",
  "var(--color-muted-foreground)",
];

const tooltipStyle = {
  borderRadius: 8,
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
} as const;

function FinanceiroPage() {
  const { mask } = useHideValues();
  const [filtros, setFiltros] = useState<FiltrosFin>(() => filtrosIniciais(180));
  const { data, isLoading } = useBiDados(filtros.de, filtros.ate);

  const viagemInfo = useMemo(() => {
    const m = new Map<string, { cliente: string; placa: string; motorista: string; codigo: string }>();
    for (const v of data?.viagens ?? []) {
      m.set(v.id, { cliente: v.cliente, placa: v.placa, motorista: v.motorista, codigo: v.codigo ?? "" });
    }
    return m;
  }, [data]);

  const filtrarComuns = useMemo(() => {
    const q = filtros.busca.trim().toLowerCase();
    return (l: LancBi) => {
      if (!selecionado(filtros.clienteIds, l.cliente_id)) return false;
      if (!selecionado(filtros.veiculoIds, l.veiculo_id)) return false;
      if (!selecionado(filtros.motoristaIds, l.motorista_id)) return false;
      if (!statusCombina(l, filtros.status)) return false;
      if (!q) return true;
      const v = l.viagem_id ? viagemInfo.get(l.viagem_id) : undefined;
      return [
        l.descricao,
        l.numero_documento ?? "",
        data?.nomeCliente(l.cliente_id) ?? "",
        data?.nomeVeiculo(l.veiculo_id) ?? "",
        data?.nomeMotorista(l.motorista_id) ?? "",
        v?.codigo ?? "",
        v?.placa ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    };
  }, [data, filtros, viagemInfo]);

  /** Regime de COMPETÊNCIA — base de todos os indicadores gerenciais. */
  const lancamentos = useMemo(
    () => (data?.lancamentos ?? []).filter(filtrarComuns),
    [data, filtrarComuns],
  );

  /** Regime de CAIXA — aging, próximos vencimentos e fluxo de caixa. */
  const lancamentosCaixa = useMemo(
    () => (data?.lancamentosCaixa ?? []).filter(filtrarComuns),
    [data, filtrarComuns],
  );


  const hoje = hojeLocal();

  const stats = useMemo(() => {
    let faturamento = 0;
    let recebido = 0;
    let aReceber = 0;
    let atrasadoReceber = 0;
    let despesas = 0;
    let pago = 0;
    let aPagar = 0;
    let atrasadoPagar = 0;
    for (const l of lancamentos) {
      if (l.tipo === "receber") {
        faturamento += l.valor;
        if (l.status === "pago") recebido += l.valor;
        else if (l.status === "atrasado") atrasadoReceber += l.valor;
        else aReceber += l.valor;
      } else {
        despesas += l.valor;
        if (l.status === "pago") pago += l.valor;
        else if (l.status === "atrasado") atrasadoPagar += l.valor;
        else aPagar += l.valor;
      }
    }
    const viagens = new Set(lancamentos.filter((l) => l.tipo === "receber" && l.viagem_id).map((l) => l.viagem_id)).size;
    return {
      faturamento,
      recebido,
      aReceber: aReceber + atrasadoReceber,
      atrasadoReceber,
      despesas,
      pago,
      aPagar: aPagar + atrasadoPagar,
      atrasadoPagar,
      lucro: faturamento - despesas,
      margem: faturamento > 0 ? ((faturamento - despesas) / faturamento) * 100 : 0,
      saldoRealizado: recebido - pago,
      inadimplencia: faturamento > 0 ? (atrasadoReceber / faturamento) * 100 : 0,
      ticket: viagens ? faturamento / viagens : 0,
      viagens,
    };
  }, [lancamentos]);

  const serie = useMemo(() => {
    const map = new Map<string, { chave: string; mes: string; receitas: number; despesas: number; saldo: number; acumulado: number }>();
    for (const l of lancamentos) {
      const ref = l.competencia;
      if (!ref) continue;
      const chave = ref.slice(0, 7);

      const b = map.get(chave) ?? { chave, mes: rotuloMes(chave), receitas: 0, despesas: 0, saldo: 0, acumulado: 0 };
      if (l.tipo === "receber") b.receitas += l.valor;
      else b.despesas += l.valor;
      map.set(chave, b);
    }
    let acumulado = 0;
    return Array.from(map.values())
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((b) => {
        const saldo = b.receitas - b.despesas;
        acumulado += saldo;
        return { ...b, saldo, acumulado };
      });
  }, [lancamentos]);

  const porCategoria = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lancamentos) {
      if (l.tipo !== "pagar") continue;
      const cat = l.categoria?.trim() || categoriaDespesa(l.categoria);
      map.set(cat, (map.get(cat) ?? 0) + l.valor);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [lancamentos]);

  const porCentroCusto = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lancamentos) {
      if (l.tipo !== "pagar") continue;
      const cc = l.centro_custo?.trim() || "Sem centro de custo";
      map.set(cc, (map.get(cc) ?? 0) + l.valor);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [lancamentos]);

  const topClientes = useMemo(() => {
    const map = new Map<string, { nome: string; receita: number; aberto: number }>();
    for (const l of lancamentos) {
      if (l.tipo !== "receber" || !l.cliente_id) continue;
      const nome = data?.nomeCliente(l.cliente_id) ?? "—";
      const b = map.get(l.cliente_id) ?? { nome, receita: 0, aberto: 0 };
      b.receita += l.valor;
      if (l.status !== "pago") b.aberto += l.valor;
      map.set(l.cliente_id, b);
    }
    return Array.from(map.values()).sort((a, b) => b.receita - a.receita).slice(0, 10);
  }, [lancamentos, data]);

  const aging = useMemo(() => {
    const faixas = [
      { faixa: "A vencer", receber: 0, pagar: 0 },
      { faixa: "1–15 dias", receber: 0, pagar: 0 },
      { faixa: "16–30 dias", receber: 0, pagar: 0 },
      { faixa: "31–60 dias", receber: 0, pagar: 0 },
      { faixa: "60+ dias", receber: 0, pagar: 0 },
    ];
    for (const l of lancamentosCaixa) {
      if (l.status === "pago" || !l.data_vencimento) continue;
      const dias = Math.floor((Date.parse(hoje) - Date.parse(l.data_vencimento)) / 86_400_000);
      const i = dias <= 0 ? 0 : dias <= 15 ? 1 : dias <= 30 ? 2 : dias <= 60 ? 3 : 4;
      if (l.tipo === "receber") faixas[i].receber += l.valor;
      else faixas[i].pagar += l.valor;
    }
    return faixas;
  }, [lancamentosCaixa, hoje]);

  const proximosVencer = useMemo(
    () =>
      lancamentosCaixa
        .filter((l) => l.status !== "pago" && l.data_vencimento && l.data_vencimento >= hoje)
        .sort((a, b) => (a.data_vencimento ?? "").localeCompare(b.data_vencimento ?? ""))
        .slice(0, 8),
    [lancamentosCaixa, hoje],
  );


  const periodoLabel = `${dt(filtros.de)} a ${dt(filtros.ate)}`;

  const linhasExport = () =>
    lancamentos.map((l) => [
      l.tipo === "receber" ? "Receber" : "Pagar",
      l.descricao,
      data?.nomeCliente(l.cliente_id) ?? "—",
      data?.nomeVeiculo(l.veiculo_id) ?? "—",
      l.categoria ?? "—",
      l.centro_custo ?? "—",
      dt(l.competencia),
      dt(l.data_emissao),
      dt(l.data_vencimento),
      dt(l.data_pagamento),
      l.status,
      l.valor,
    ]);

  const colunas = [
    "Tipo",
    "Descrição",
    "Cliente",
    "Veículo",
    "Categoria",
    "Centro de custo",
    "Competência",
    "Emissão",

    "Vencimento",
    "Pagamento",
    "Status",
    "Valor",
  ];

  const exportExcel = () =>
    exportarExcel(`financeiro-${filtros.de}-a-${filtros.ate}`, [
      {
        nome: "Resumo",
        colunas: ["Indicador", "Valor"],
        linhas: [
          ["Faturamento total", stats.faturamento],
          ["Recebido", stats.recebido],
          ["A receber", stats.aReceber],
          ["Despesas totais", stats.despesas],
          ["Pago", stats.pago],
          ["A pagar", stats.aPagar],
          ["Lucro líquido", stats.lucro],
          ["Margem (%)", stats.margem],
          ["Inadimplência (%)", stats.inadimplencia],
          ["Ticket médio por viagem", stats.ticket],
        ],
      },
      { nome: "Lançamentos", colunas, linhas: linhasExport() },
      {
        nome: "Mensal",
        colunas: ["Mês", "Receitas", "Despesas", "Saldo", "Acumulado"],
        linhas: serie.map((s) => [s.mes, s.receitas, s.despesas, s.saldo, s.acumulado]),
      },
    ]);

  const exportPdf = () =>
    exportarPdf({
      nomeArquivo: `financeiro-${filtros.de}-a-${filtros.ate}`,
      titulo: "Dashboard Financeiro",
      subtitulo: `Período: ${periodoLabel}`,
      kpis: [
        ["Faturamento", brl(stats.faturamento)],
        ["Despesas", brl(stats.despesas)],
        ["Lucro líquido", brl(stats.lucro)],
        ["Margem", pct(stats.margem)],
        ["Inadimplência", pct(stats.inadimplencia)],
      ],
      secoes: [{ titulo: "Lançamentos do período", colunas, linhas: linhasExport() }],
    });


  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
            <Wallet className="size-5 text-brand" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Dashboard Financeiro</h1>
            <p className="text-sm text-muted-foreground">Faturamento, despesas, resultado e inadimplência</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HideValuesToggle />
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!lancamentos.length}>
            <FileSpreadsheet className="mr-1 size-3.5" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!lancamentos.length}>
            <Download className="mr-1 size-3.5" /> PDF
          </Button>
        </div>
      </div>

      <FiltrosFinanceiros value={filtros} onChange={setFiltros} dados={data} />

      {isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Faturamento total"
              value={mask(brl(stats.faturamento))}
              sub={`${mask(brl(stats.recebido))} recebido`}
              tone="brand"
              icon={TrendingUp}
            />
            <KpiCard
              label="Despesas totais"
              value={mask(brl(stats.despesas))}
              sub={`${mask(brl(stats.pago))} pago`}
              tone="danger"
              icon={TrendingDown}
            />
            <KpiCard
              label="Lucro líquido"
              value={mask(brl(stats.lucro))}
              sub={`Margem ${pct(stats.margem)}`}
              tone={stats.lucro >= 0 ? "success" : "danger"}
              icon={Wallet}
            />
            <KpiCard
              label="Inadimplência"
              value={pct(stats.inadimplencia)}
              sub={`${mask(brl(stats.atrasadoReceber))} vencido`}
              tone={stats.inadimplencia > 0 ? "danger" : "neutral"}
              icon={Percent}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="A receber" value={mask(brl(stats.aReceber))} sub={`${mask(brl(stats.atrasadoReceber))} em atraso`} />
            <KpiCard label="A pagar" value={mask(brl(stats.aPagar))} sub={`${mask(brl(stats.atrasadoPagar))} em atraso`} />
            <KpiCard label="Saldo realizado" value={mask(brl(stats.saldoRealizado))} tone={stats.saldoRealizado >= 0 ? "success" : "danger"} />
            <KpiCard label="Ticket médio" value={mask(brl(stats.ticket))} sub={`${stats.viagens} viagens faturadas`} />
          </div>

          <Card className="p-4 md:p-6">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold">Receitas × Despesas</h2>
              <p className="text-xs text-muted-foreground">Por competência (pagamento, vencimento ou emissão)</p>
            </div>
            {serie.length === 0 ? (
              <SecaoVazia />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="mes" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="receitas" name="Receitas" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="despesas" name="Despesas" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="saldo" name="Saldo" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 md:p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Saldo acumulado</h2>
              {serie.length === 0 ? (
                <SecaoVazia />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={serie}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="mes" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                      <Area
                        type="monotone"
                        dataKey="acumulado"
                        name="Acumulado"
                        stroke="var(--color-brand)"
                        fill="var(--color-brand)"
                        fillOpacity={0.18}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-4 md:p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Despesas por categoria</h2>
              {porCategoria.length === 0 ? (
                <SecaoVazia />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={porCategoria.slice(0, 8)} dataKey="value" nameKey="name" innerRadius={45} outerRadius={95} paddingAngle={2}>
                        {porCategoria.slice(0, 8).map((_, i) => (
                          <Cell key={i} fill={CORES[i % CORES.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4 md:p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Despesas por centro de custo</h2>
              {porCentroCusto.length === 0 ? (
                <SecaoVazia />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porCentroCusto} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" fontSize={10} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={130} fontSize={10} />
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                      <Bar dataKey="value" name="Despesas" fill="var(--color-destructive)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-4 md:p-6">
              <h2 className="mb-4 font-display text-lg font-bold">Aging de contas em aberto</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={aging}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="faixa" fontSize={10} />
                    <YAxis fontSize={10} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="receber" name="A receber" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pagar" name="A pagar" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4 md:p-6">
            <h2 className="mb-4 font-display text-lg font-bold">Top 10 clientes por faturamento</h2>
            {topClientes.length === 0 ? (
              <SecaoVazia />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topClientes} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" fontSize={10} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="nome" width={140} fontSize={10} />
                    <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="receita" name="Faturado" fill="var(--color-brand)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="aberto" name="Em aberto" fill="var(--color-chart-4)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <div className="border-b border-border/60 p-4 md:p-6">
              <h2 className="font-display text-lg font-bold">Próximos vencimentos</h2>
            </div>
            {proximosVencer.length === 0 ? (
              <SecaoVazia>Sem lançamentos futuros no período filtrado.</SecaoVazia>
            ) : (
              <ul className="divide-y divide-border/60">
                {proximosVencer.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={l.tipo === "receber" ? "default" : "outline"}>
                          {l.tipo === "receber" ? "Receber" : "Pagar"}
                        </Badge>
                        <span className="truncate font-medium">{l.descricao}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">Vence em {dt(l.data_vencimento)}</div>
                    </div>
                    <div className={`font-mono font-semibold ${l.tipo === "receber" ? "text-brand" : "text-destructive"}`}>
                      {l.tipo === "receber" ? "+" : "−"} {mask(brl(l.valor))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {stats.atrasadoReceber + stats.atrasadoPagar > 0 && (
            <Card className="flex items-start gap-3 border-destructive/40 p-4">
              <AlertCircle className="mt-0.5 size-4 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Existem <strong className="text-destructive">{mask(brl(stats.atrasadoReceber))}</strong> a receber e{" "}
                <strong className="text-destructive">{mask(brl(stats.atrasadoPagar))}</strong> a pagar vencidos no período
                selecionado.
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
