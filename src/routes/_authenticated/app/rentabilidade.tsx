import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { Building2, FileSpreadsheet, FileText, Gauge, Loader2, MapPin, Truck, TrendingUp, Users } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SortHead, useSort } from "@/components/ui/sortable";
import { KpiCard, SecaoVazia } from "@/components/relatorios/kpi-card";
import {
  FiltrosFinanceiros,
  selecionado,
  rotuloSelecao,
  filtrosIniciais,
  useEmpresas,
  type FiltrosFin,
} from "@/components/relatorios/filtros-financeiros";

import { useBiDados, rotuloMes, type ViagemBi } from "@/hooks/use-bi-dados";
import { brl, capturarElemento, dt, exportarExcel, exportarPdf, num, pct, type PdfImagem } from "@/lib/export-utils";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/app/rentabilidade")({
  head: () => ({
    meta: [
      { title: "Rentabilidade — G3 Expresso" },
      { name: "description", content: "Indicadores estratégicos de rentabilidade por cliente, veículo, motorista e rota." },
      { property: "og:title", content: "Rentabilidade — G3 Expresso" },
      { property: "og:description", content: "Business Intelligence financeiro da operação G3 Expresso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RentabilidadePage,
});

const CORES = [
  "var(--color-brand)",
  "var(--color-chart-2)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-3)",
  "var(--color-muted-foreground)",
];

type Agregado = {
  id: string;
  nome: string;
  viagens: number;
  receita: number;
  despesas: number;
  lucro: number;
  margem: number;
  emAberto: number;
  atrasado: number;
  km: number;
  receitaPorViagem: number;
  receitaPorKm: number;
};

type AjusteFinanceiro = {
  id: string;
  clienteId: string | null;
  veiculoId: string | null;
  motoristaId: string | null;
  competencia: string;
  receita: number;
  despesas: number;
};

function agregar(viagens: ViagemBi[], chave: (v: ViagemBi) => { id: string; nome: string } | null): Agregado[] {
  const map = new Map<string, Agregado>();
  for (const v of viagens) {
    const k = chave(v);
    if (!k) continue;
    const cur =
      map.get(k.id) ??
      ({
        id: k.id,
        nome: k.nome,
        viagens: 0,
        receita: 0,
        despesas: 0,
        lucro: 0,
        margem: 0,
        emAberto: 0,
        atrasado: 0,
        km: 0,
        receitaPorViagem: 0,
        receitaPorKm: 0,
      } as Agregado);
    cur.viagens += 1;
    cur.receita += v.receita;
    cur.despesas += v.despesas;
    cur.emAberto += v.pendente + v.atrasado;
    cur.atrasado += v.atrasado;
    cur.km += v.km;
    map.set(k.id, cur);
  }
  return Array.from(map.values()).map((a) => ({
    ...a,
    lucro: a.receita - a.despesas,
    margem: a.receita > 0 ? ((a.receita - a.despesas) / a.receita) * 100 : 0,
    receitaPorViagem: a.viagens ? a.receita / a.viagens : 0,
    receitaPorKm: a.km ? a.receita / a.km : 0,
  }));
}

function RentabilidadePage() {
  const { role } = useAuth();
  const podeVer = role === "administrador" || role === "financeiro" || role === "gestor";
  const [filtros, setFiltros] = useState<FiltrosFin>(() => filtrosIniciais(365));
  const { data, isLoading } = useBiDados(filtros.de, filtros.ate);
  const { data: empresas = [] } = useEmpresas();

  const viagens = useMemo(() => {
    if (!data) return [];
    const q = filtros.busca.trim().toLowerCase();
    return data.viagens.filter((v) => {
      if (v.status === "cancelada") return false;
      if (!selecionado(filtros.clienteIds, v.cliente_id)) return false;
      if (!selecionado(filtros.veiculoIds, v.veiculo_id)) return false;
      if (!selecionado(filtros.motoristaIds, v.motorista_id)) return false;
      if (!q) return true;
      return [v.codigo ?? "", v.cliente, v.motorista, v.placa, v.rota].join(" ").toLowerCase().includes(q);
    });
  }, [data, filtros]);

  const ajustes = useMemo<AjusteFinanceiro[]>(() => {
    if (!data) return [];
    const viagensDoPeriodo = new Set(data.viagens.map((v) => v.id));
    const q = filtros.busca.trim().toLowerCase();
    return data.lancamentos
      .filter((l) => !l.viagem_id || !viagensDoPeriodo.has(l.viagem_id))
      .filter((l) => selecionado(filtros.clienteIds, l.cliente_id))
      .filter((l) => selecionado(filtros.veiculoIds, l.veiculo_id))
      .filter((l) => selecionado(filtros.motoristaIds, l.motorista_id))
      .filter((l) => {
        if (!q) return true;
        return [
          l.numero_documento ?? "",
          l.descricao,
          data.nomeCliente(l.cliente_id),
          data.nomeVeiculo(l.veiculo_id),
          data.nomeMotorista(l.motorista_id),
        ].join(" ").toLowerCase().includes(q);
      })
      .map((l) => ({
        id: l.id,
        clienteId: l.cliente_id,
        veiculoId: l.veiculo_id,
        motoristaId: l.motorista_id,
        competencia: l.competencia,
        receita: l.tipo === "receber" ? l.valor : 0,
        despesas: l.tipo === "pagar" ? l.valor : 0,
      }));
  }, [data, filtros]);

  const aplicarAjustes = (
    base: Agregado[],
    id: (a: AjusteFinanceiro) => string | null,
    nome: (id: string) => string,
  ) => {
    const map = new Map(base.map((r) => [r.id, { ...r }]));
    for (const a of ajustes) {
      const chave = id(a);
      if (!chave) continue;
      const cur = map.get(chave) ?? {
        id: chave, nome: nome(chave), viagens: 0, receita: 0, despesas: 0, lucro: 0,
        margem: 0, emAberto: 0, atrasado: 0, km: 0, receitaPorViagem: 0, receitaPorKm: 0,
      };
      cur.receita += a.receita;
      cur.despesas += a.despesas;
      cur.lucro = cur.receita - cur.despesas;
      cur.margem = cur.receita > 0 ? (cur.lucro / cur.receita) * 100 : 0;
      cur.receitaPorViagem = cur.viagens ? cur.receita / cur.viagens : 0;
      cur.receitaPorKm = cur.km ? cur.receita / cur.km : 0;
      map.set(chave, cur);
    }
    return Array.from(map.values());
  };

  const clientes = useMemo(
    () => aplicarAjustes(
      agregar(viagens, (v) => (v.cliente_id ? { id: v.cliente_id, nome: v.cliente } : null)),
      (a) => a.clienteId,
      (id) => data?.nomeCliente(id) ?? "—",
    ),
    [viagens, ajustes, data],
  );
  const veiculos = useMemo(
    () => aplicarAjustes(
      agregar(viagens, (v) => (v.veiculo_id ? { id: v.veiculo_id, nome: v.veiculo } : null)),
      (a) => a.veiculoId,
      (id) => data?.nomeVeiculo(id) ?? "—",
    ),
    [viagens, ajustes, data],
  );
  const motoristas = useMemo(
    () => aplicarAjustes(
      agregar(viagens, (v) => (v.motorista_id ? { id: v.motorista_id, nome: v.motorista } : null)),
      (a) => a.motoristaId,
      (id) => data?.nomeMotorista(id) ?? "—",
    ),
    [viagens, ajustes, data],
  );
  const rotas = useMemo(() => agregar(viagens, (v) => ({ id: v.rota, nome: v.rota })), [viagens]);
  const origens = useMemo(() => agregar(viagens, (v) => ({ id: v.origem, nome: v.origem })), [viagens]);
  const destinos = useMemo(() => agregar(viagens, (v) => ({ id: v.destino, nome: v.destino })), [viagens]);

  const totais = useMemo(() => {
    const receita = viagens.reduce((s, v) => s + v.receita, 0) + ajustes.reduce((s, a) => s + a.receita, 0);
    const despesas = viagens.reduce((s, v) => s + v.despesas, 0) + ajustes.reduce((s, a) => s + a.despesas, 0);
    return {
      receita,
      despesas,
      lucro: receita - despesas,
      margem: receita > 0 ? ((receita - despesas) / receita) * 100 : 0,
      viagens: viagens.length,
      km: viagens.reduce((s, v) => s + v.km, 0),
    };
  }, [viagens, ajustes]);

  const serie = useMemo(() => {
    const map = new Map<string, { chave: string; mes: string; receita: number; despesas: number; lucro: number; margem: number }>();
    for (const v of viagens) {
      const key = v.ref.slice(0, 7);
      const b = map.get(key) ?? { chave: key, mes: rotuloMes(key), receita: 0, despesas: 0, lucro: 0, margem: 0 };
      b.receita += v.receita;
      b.despesas += v.despesas;
      map.set(key, b);
    }
    for (const a of ajustes) {
      const key = a.competencia.slice(0, 7);
      if (!key) continue;
      const b = map.get(key) ?? { chave: key, mes: rotuloMes(key), receita: 0, despesas: 0, lucro: 0, margem: 0 };
      b.receita += a.receita;
      b.despesas += a.despesas;
      map.set(key, b);
    }
    return Array.from(map.values())
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((b) => ({ ...b, lucro: b.receita - b.despesas, margem: b.receita ? ((b.receita - b.despesas) / b.receita) * 100 : 0 }));
  }, [viagens, ajustes]);

  const serieAnual = useMemo(() => {
    const map = new Map<string, { ano: string; receita: number; despesas: number; lucro: number }>();
    for (const v of viagens) {
      const ano = v.ref.slice(0, 4);
      const b = map.get(ano) ?? { ano, receita: 0, despesas: 0, lucro: 0 };
      b.receita += v.receita;
      b.despesas += v.despesas;
      map.set(ano, b);
    }
    for (const a of ajustes) {
      const ano = a.competencia.slice(0, 4);
      if (!ano) continue;
      const b = map.get(ano) ?? { ano, receita: 0, despesas: 0, lucro: 0 };
      b.receita += a.receita;
      b.despesas += a.despesas;
      map.set(ano, b);
    }
    return Array.from(map.values())
      .sort((a, b) => a.ano.localeCompare(b.ano))
      .map((b) => ({ ...b, lucro: b.receita - b.despesas }));
  }, [viagens, ajustes]);

  const comparativos = useMemo(() => {
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    const ant = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesAnterior = `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, "0")}`;
    const busca = (chave: string) => serie.find((s) => s.chave === chave);
    const anoAtual = serieAnual.find((s) => s.ano === String(hoje.getFullYear()));
    const anoAnterior = serieAnual.find((s) => s.ano === String(hoje.getFullYear() - 1));
    return {
      mesAtual: busca(mesAtual),
      mesAnterior: busca(mesAnterior),
      anoAtual,
      anoAnterior,
    };
  }, [serie, serieAnual]);

  const graficosRef = useRef<HTMLDivElement>(null);
  const [exportando, setExportando] = useState(false);

  const rotuloFiltros = () => [
    `Período ${dt(filtros.de)} a ${dt(filtros.ate)}`,
    `Clientes: ${rotuloSelecao(filtros.clienteIds, (id) => data?.nomeCliente(id) ?? "—", "Todos")}`,
    `Veículos: ${rotuloSelecao(filtros.veiculoIds, (id) => data?.nomeVeiculo(id) ?? "—", "Todos")}`,
    `Motoristas: ${rotuloSelecao(filtros.motoristaIds, (id) => data?.nomeMotorista(id) ?? "—", "Todos")}`,
  ];

  const COLS_RANK = ["Nome", "Viagens", "Receita", "Despesas", "Lucro", "Margem", "KM", "Receita/viagem", "Receita/KM"];
  const linhasRank = (l: Agregado[]) =>
    [...l]
      .sort((a, b) => b.receita - a.receita)
      .map((r) => [r.nome, r.viagens, r.receita, r.despesas, r.lucro, r.margem, r.km, r.receitaPorViagem, r.receitaPorKm]);
  const linhasRankPdf = (l: Agregado[]) =>
    [...l]
      .sort((a, b) => b.receita - a.receita)
      .map((r) => [
        r.nome,
        String(r.viagens),
        brl(r.receita),
        brl(r.despesas),
        brl(r.lucro),
        pct(r.margem),
        num(r.km, 0),
        brl(r.receitaPorViagem),
        brl(r.receitaPorKm),
      ]);

  const exportarExcelRentabilidade = () =>
    exportarExcel(`rentabilidade-${filtros.de}_${filtros.ate}.xlsx`, [
      {
        nome: "Resumo",
        colunas: ["Indicador", "Valor"],
        linhas: [
          ["Período", `${dt(filtros.de)} a ${dt(filtros.ate)}`],
          ["Receita", totais.receita],
          ["Despesas", totais.despesas],
          ["Lucro", totais.lucro],
          ["Margem (%)", totais.margem],
          ["Viagens", totais.viagens],
          ["KM", totais.km],
        ],
      },
      { nome: "Clientes", colunas: COLS_RANK, linhas: linhasRank(clientes) },
      { nome: "Veículos", colunas: COLS_RANK, linhas: linhasRank(veiculos) },
      { nome: "Motoristas", colunas: COLS_RANK, linhas: linhasRank(motoristas) },
      { nome: "Rotas", colunas: COLS_RANK, linhas: linhasRank(rotas) },
      {
        nome: "Evolução mensal",
        colunas: ["Mês", "Receita", "Despesas", "Lucro", "Margem (%)"],
        linhas: serie.map((s) => [s.mes, s.receita, s.despesas, s.lucro, s.margem]),
      },
      {
        nome: "Evolução anual",
        colunas: ["Ano", "Receita", "Despesas", "Lucro"],
        linhas: serieAnual.map((s) => [s.ano, s.receita, s.despesas, s.lucro]),
      },
    ]);

  const exportarPdfRentabilidade = async () => {
    setExportando(true);
    try {
      const png = await capturarElemento(graficosRef.current);
      const imagens: PdfImagem[] = png ? [{ titulo: "Gráficos de rentabilidade", dataUrl: png }] : [];
      exportarPdf({
        nomeArquivo: `rentabilidade-${filtros.de}_${filtros.ate}.pdf`,
        titulo: "Relatório de rentabilidade",
        subtitulo: "G3 Expresso",
        filtros: rotuloFiltros(),
        kpis: [
          ["Receita", brl(totais.receita)],
          ["Despesas", brl(totais.despesas)],
          ["Lucro", brl(totais.lucro)],
          ["Margem média", pct(totais.margem)],
          ["Viagens", String(totais.viagens)],
          ["KM rodados", num(totais.km, 0)],
        ],
        imagens,
        secoes: [
          { titulo: "Clientes", colunas: COLS_RANK, linhas: linhasRankPdf(clientes) },
          { titulo: "Veículos", colunas: COLS_RANK, linhas: linhasRankPdf(veiculos) },
          { titulo: "Motoristas", colunas: COLS_RANK, linhas: linhasRankPdf(motoristas) },
          { titulo: "Rotas", colunas: COLS_RANK, linhas: linhasRankPdf(rotas) },
          {
            titulo: "Evolução mensal",
            colunas: ["Mês", "Receita", "Despesas", "Lucro", "Margem"],
            linhas: serie.map((s) => [s.mes, brl(s.receita), brl(s.despesas), brl(s.lucro), pct(s.margem)]),
          },
        ],
      });
    } finally {
      setExportando(false);
    }
  };


  if (!podeVer) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Você não tem permissão para visualizar indicadores de rentabilidade.
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
          <Gauge className="size-5 text-brand" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Rentabilidade</h1>
          <p className="text-sm text-muted-foreground">Indicadores estratégicos de clientes, frota, motoristas e rotas</p>
        </div>
      </div>

      <FiltrosFinanceiros
        value={filtros}
        onChange={setFiltros}
        dados={data}
        mostrar={["periodo", "empresa", "cliente", "veiculo", "motorista", "busca"]}
        buscaPlaceholder="Cliente, placa, motorista, rota…"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Receita" value={brl(totais.receita)} tone="brand" icon={TrendingUp} />
        <KpiCard label="Despesas" value={brl(totais.despesas)} tone="danger" />
        <KpiCard label="Lucro" value={brl(totais.lucro)} tone={totais.lucro >= 0 ? "success" : "danger"} />
        <KpiCard label="Margem média" value={pct(totais.margem)} />
        <KpiCard label="Viagens" value={String(totais.viagens)} sub={`${num(totais.km, 0)} km rodados`} />
      </div>

      <div className="flex flex-wrap gap-2" data-export-ignore="true">
        <Button variant="outline" size="sm" onClick={exportarExcelRentabilidade}>
          <FileSpreadsheet className="mr-2 size-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportarPdfRentabilidade} disabled={exportando}>
          {exportando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />} PDF com gráficos
        </Button>
      </div>


      {isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : (
        <Tabs defaultValue="clientes">
          <TabsList className="flex-wrap">
            <TabsTrigger value="clientes"><Users className="mr-1 size-3.5" />Clientes</TabsTrigger>
            <TabsTrigger value="veiculos"><Truck className="mr-1 size-3.5" />Veículos</TabsTrigger>
            <TabsTrigger value="motoristas">Motoristas</TabsTrigger>
            <TabsTrigger value="rotas"><MapPin className="mr-1 size-3.5" />Rotas</TabsTrigger>
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="empresas"><Building2 className="mr-1 size-3.5" />Empresas</TabsTrigger>
          </TabsList>

          {/* CLIENTES */}
          <TabsContent value="clientes" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <KpiCard label="Receita média por cliente" value={brl(clientes.length ? totais.receita / clientes.length : 0)} />
              <KpiCard label="Lucro médio por cliente" value={brl(clientes.length ? totais.lucro / clientes.length : 0)} />
              <KpiCard label="Clientes ativos no período" value={String(clientes.length)} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <GraficoBarras titulo="Top 10 clientes por faturamento" dados={topo(clientes, "receita")} chave="receita" />
              <GraficoBarras titulo="Top 10 clientes mais lucrativos" dados={topo(clientes, "lucro")} chave="lucro" />
            </div>
            <TabelaRank titulo="Ranking de clientes" linhas={clientes} rotulo="Cliente" />
            <div className="grid gap-4 lg:grid-cols-2">
              <TabelaSimples
                titulo="Maior valor em aberto"
                colunas={["Cliente", "Em aberto", "Em atraso"]}
                linhas={topo(clientes, "emAberto").map((c) => [c.nome, brl(c.emAberto), brl(c.atrasado)])}
              />
              <TabelaSimples
                titulo="Clientes com maior atraso"
                colunas={["Cliente", "Em atraso", "Viagens"]}
                linhas={topo(clientes, "atrasado").map((c) => [c.nome, brl(c.atrasado), String(c.viagens)])}
              />
            </div>
            <TabelaSimples
              titulo="Clientes com maior número de viagens"
              colunas={["Cliente", "Viagens", "Receita"]}
              linhas={topo(clientes, "viagens").map((c) => [c.nome, String(c.viagens), brl(c.receita)])}
            />
          </TabsContent>

          {/* VEÍCULOS */}
          <TabsContent value="veiculos" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <GraficoBarras titulo="Top 10 veículos por faturamento" dados={topo(veiculos, "receita")} chave="receita" />
              <GraficoBarras titulo="Top 10 veículos mais lucrativos" dados={topo(veiculos, "lucro")} chave="lucro" />
            </div>
            <TabelaSimples
              titulo="Maior custo operacional"
              colunas={["Veículo", "Despesas", "Receita", "Margem"]}
              linhas={topo(veiculos, "despesas").map((v) => [v.nome, brl(v.despesas), brl(v.receita), pct(v.margem)])}
            />
            <TabelaRank titulo="Ranking de veículos" linhas={veiculos} rotulo="Veículo" mostrarKm />
          </TabsContent>

          {/* MOTORISTAS */}
          <TabsContent value="motoristas" className="space-y-4">
            <GraficoBarras titulo="Receita transportada por motorista" dados={topo(motoristas, "receita")} chave="receita" />
            <TabelaRank titulo="Ranking de motoristas" linhas={motoristas} rotulo="Motorista" mostrarKm />
            <TabelaSimples
              titulo="Receita mensal por motorista (top 10)"
              colunas={["Motorista", "Viagens", "Receita", "Receita média/viagem", "Receita mensal", "Receita anual"]}
              linhas={topo(motoristas, "receita").map((m) => {
                const mensal = serie.length ? m.receita / serie.length : m.receita;
                return [m.nome, String(m.viagens), brl(m.receita), brl(m.receitaPorViagem), brl(mensal), brl(mensal * 12)];
              })}
            />
          </TabsContent>

          {/* ROTAS */}
          <TabsContent value="rotas" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <TabelaSimples
                titulo="Rotas mais lucrativas"
                colunas={["Rota", "Viagens", "Lucro", "Margem"]}
                linhas={topo(rotas, "lucro").map((r) => [r.nome, String(r.viagens), brl(r.lucro), pct(r.margem)])}
              />
              <TabelaSimples
                titulo="Rotas menos lucrativas"
                colunas={["Rota", "Viagens", "Lucro", "Margem"]}
                linhas={[...rotas]
                  .sort((a, b) => a.lucro - b.lucro)
                  .slice(0, 10)
                  .map((r) => [r.nome, String(r.viagens), brl(r.lucro), pct(r.margem)])}
              />
            </div>
            <GraficoBarras titulo="Rotas com maior faturamento" dados={topo(rotas, "receita")} chave="receita" />
            <div className="grid gap-4 lg:grid-cols-2">
              <TabelaSimples
                titulo="Receita por origem"
                colunas={["Origem", "Viagens", "Receita"]}
                linhas={topo(origens, "receita").map((r) => [r.nome, String(r.viagens), brl(r.receita)])}
              />
              <TabelaSimples
                titulo="Receita por destino"
                colunas={["Destino", "Viagens", "Receita"]}
                linhas={topo(destinos, "receita").map((r) => [r.nome, String(r.viagens), brl(r.receita)])}
              />
            </div>
          </TabsContent>

          {/* EVOLUÇÃO */}
          <TabsContent value="evolucao" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Comparativo
                titulo="Mês atual × mês anterior"
                atualLabel="Mês atual"
                atual={comparativos.mesAtual?.lucro ?? 0}
                anteriorLabel="Mês anterior"
                anterior={comparativos.mesAnterior?.lucro ?? 0}
                receitaAtual={comparativos.mesAtual?.receita ?? 0}
                receitaAnterior={comparativos.mesAnterior?.receita ?? 0}
              />
              <Comparativo
                titulo="Ano atual × ano anterior"
                atualLabel="Ano atual"
                atual={comparativos.anoAtual?.lucro ?? 0}
                anteriorLabel="Ano anterior"
                anterior={comparativos.anoAnterior?.lucro ?? 0}
                receitaAtual={comparativos.anoAtual?.receita ?? 0}
                receitaAnterior={comparativos.anoAnterior?.receita ?? 0}
              />
            </div>

            <Card className="p-4 md:p-6">
              <h3 className="mb-4 font-display font-bold">Evolução do faturamento</h3>
              {serie.length === 0 ? (
                <SecaoVazia />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={serie}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="mes" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                      <Legend />
                      <Area type="monotone" dataKey="receita" name="Receita" stroke="var(--color-brand)" fill="var(--color-brand)" fillOpacity={0.18} />
                      <Area type="monotone" dataKey="despesas" name="Despesas" stroke="var(--color-destructive)" fill="var(--color-destructive)" fillOpacity={0.12} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4 md:p-6">
                <h3 className="mb-4 font-display font-bold">Lucro mensal</h3>
                {serie.length === 0 ? (
                  <SecaoVazia />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={serie}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="mes" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                        <Bar dataKey="lucro" name="Lucro" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
              <Card className="p-4 md:p-6">
                <h3 className="mb-4 font-display font-bold">Evolução da margem de lucro</h3>
                {serie.length === 0 ? (
                  <SecaoVazia />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serie}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="mes" fontSize={11} />
                        <YAxis fontSize={11} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
                        <Tooltip formatter={(v: number) => pct(v)} contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="margem" name="Margem" stroke="var(--color-brand)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-4 md:p-6">
              <h3 className="mb-4 font-display font-bold">Receita anual</h3>
              {serieAnual.length === 0 ? (
                <SecaoVazia />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serieAnual}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="ano" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="receita" name="Receita" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="despesas" name="Despesas" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="lucro" name="Lucro" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* EMPRESAS */}
          <TabsContent value="empresas" className="space-y-4">
            {empresas.length <= 1 ? (
              <Card className="p-6 text-sm text-muted-foreground">
                Há apenas uma empresa cadastrada ({empresas[0]?.nome ?? "—"}). Os indicadores abaixo representam o consolidado
                da operação. Ao cadastrar novas empresas, o comparativo é habilitado automaticamente.
              </Card>
            ) : null}
            <div className="grid gap-3 md:grid-cols-4">
              <KpiCard label="Receita" value={brl(totais.receita)} tone="brand" />
              <KpiCard label="Despesas" value={brl(totais.despesas)} tone="danger" />
              <KpiCard label="Lucro" value={brl(totais.lucro)} tone={totais.lucro >= 0 ? "success" : "danger"} />
              <KpiCard label="Margem" value={pct(totais.margem)} />
            </div>
            <Card className="p-4 md:p-6">
              <h3 className="mb-4 font-display font-bold">Composição da receita por cliente</h3>
              {clientes.length === 0 ? (
                <SecaoVazia />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={topo(clientes, "receita").map((c) => ({ name: c.nome, value: c.receita }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {topo(clientes, "receita").map((_, i) => (
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
          </TabsContent>
        </Tabs>
      )}

      {/* Área fora da tela usada apenas para gerar as imagens dos gráficos no PDF */}
      <div className="pointer-events-none fixed -left-[10000px] top-0" aria-hidden>
        <div ref={graficosRef} className="w-[900px] space-y-4 bg-card p-4">
          <GraficoExport titulo="Evolução mensal — receita × despesas × lucro">
            <BarChart width={860} height={240} data={serie}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Legend />
              <Bar dataKey="receita" name="Receita" fill="#f15a24" />
              <Bar dataKey="despesas" name="Despesas" fill="#b42318" />
              <Bar dataKey="lucro" name="Lucro" fill="#137d55" />
            </BarChart>
          </GraficoExport>
          <GraficoExport titulo="Top 10 clientes por lucro">
            <BarChart width={860} height={260} data={topo(clientes, "lucro")} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={10} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nome" width={180} fontSize={10} />
              <Bar dataKey="lucro" name="Lucro" fill="#f15a24" />
            </BarChart>
          </GraficoExport>
          <GraficoExport titulo="Top 10 veículos por lucro">
            <BarChart width={860} height={260} data={topo(veiculos, "lucro")} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={10} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nome" width={180} fontSize={10} />
              <Bar dataKey="lucro" name="Lucro" fill="#137d55" />
            </BarChart>
          </GraficoExport>
        </div>
      </div>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 8,
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
} as const;

function topo(linhas: Agregado[], chave: keyof Agregado, n = 10) {


  return [...linhas].sort((a, b) => Number(b[chave]) - Number(a[chave])).slice(0, n);
}

function GraficoBarras({ titulo, dados, chave }: { titulo: string; dados: Agregado[]; chave: "receita" | "lucro" }) {
  return (
    <Card className="p-4 md:p-6">
      <h3 className="mb-4 font-display font-bold">{titulo}</h3>
      {dados.length === 0 ? (
        <SecaoVazia />
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={10} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nome" width={130} fontSize={10} />
              <Tooltip formatter={(v: number) => brl(v)} contentStyle={tooltipStyle} />
              <Bar dataKey={chave} name={chave === "receita" ? "Receita" : "Lucro"} fill="var(--color-brand)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function TabelaRank({
  titulo,
  linhas,
  rotulo,
  mostrarKm,
}: {
  titulo: string;
  linhas: Agregado[];
  rotulo: string;
  mostrarKm?: boolean;
}) {
  const acc = {
    nome: (r: Agregado) => r.nome,
    viagens: (r: Agregado) => r.viagens,
    receita: (r: Agregado) => r.receita,
    despesas: (r: Agregado) => r.despesas,
    lucro: (r: Agregado) => r.lucro,
    margem: (r: Agregado) => r.margem,
    km: (r: Agregado) => r.km,
    porViagem: (r: Agregado) => r.receitaPorViagem,
    porKm: (r: Agregado) => r.receitaPorKm,
  };
  const { sorted, sort, toggle } = useSort(linhas, acc, { key: "receita", dir: "desc" });

  return (
    <Card>
      <div className="border-b border-border/60 p-4">
        <h3 className="font-display font-bold">{titulo}</h3>
      </div>
      {sorted.length === 0 ? (
        <SecaoVazia />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead sortKey="nome" sort={sort} onToggle={toggle}>{rotulo}</SortHead>
                <SortHead sortKey="viagens" sort={sort} onToggle={toggle} align="right">Viagens</SortHead>
                <SortHead sortKey="receita" sort={sort} onToggle={toggle} align="right">Receita</SortHead>
                <SortHead sortKey="despesas" sort={sort} onToggle={toggle} align="right">Despesas</SortHead>
                <SortHead sortKey="lucro" sort={sort} onToggle={toggle} align="right">Lucro</SortHead>
                <SortHead sortKey="margem" sort={sort} onToggle={toggle} align="right">Margem</SortHead>
                <SortHead sortKey="porViagem" sort={sort} onToggle={toggle} align="right">Receita/viagem</SortHead>
                {mostrarKm && (
                  <>
                    <SortHead sortKey="km" sort={sort} onToggle={toggle} align="right">KM</SortHead>
                    <SortHead sortKey="porKm" sort={sort} onToggle={toggle} align="right">Receita/KM</SortHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-right font-mono">{r.viagens}</TableCell>
                  <TableCell className="text-right font-mono">{brl(r.receita)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{brl(r.despesas)}</TableCell>
                  <TableCell className={`text-right font-mono font-semibold ${r.lucro >= 0 ? "text-brand" : "text-destructive"}`}>
                    {brl(r.lucro)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{pct(r.margem)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(r.receitaPorViagem)}</TableCell>
                  {mostrarKm && (
                    <>
                      <TableCell className="text-right font-mono">{num(r.km, 0)}</TableCell>
                      <TableCell className="text-right font-mono">{brl(r.receitaPorKm)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function TabelaSimples({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: string[][] }) {
  return (
    <Card>
      <div className="border-b border-border/60 p-4">
        <h3 className="font-display font-bold">{titulo}</h3>
      </div>
      {linhas.length === 0 ? (
        <SecaoVazia />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 text-xs uppercase text-muted-foreground">
              <tr>
                {colunas.map((c, i) => (
                  <th key={c} className={i === 0 ? "p-3 text-left" : "p-3 text-right"}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {linhas.map((l, i) => (
                <tr key={i}>
                  {l.map((c, j) => (
                    <td key={j} className={j === 0 ? "p-3" : "p-3 text-right font-mono"}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Comparativo({
  titulo,
  atualLabel,
  atual,
  anteriorLabel,
  anterior,
  receitaAtual,
  receitaAnterior,
}: {
  titulo: string;
  atualLabel: string;
  atual: number;
  anteriorLabel: string;
  anterior: number;
  receitaAtual: number;
  receitaAnterior: number;
}) {
  const varia = anterior !== 0 ? ((atual - anterior) / Math.abs(anterior)) * 100 : 0;
  const variaReceita = receitaAnterior !== 0 ? ((receitaAtual - receitaAnterior) / Math.abs(receitaAnterior)) * 100 : 0;
  return (
    <Card className="p-4 md:p-6">
      <h3 className="font-display font-bold">{titulo}</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{atualLabel}</div>
          <div className="font-mono">Receita {brl(receitaAtual)}</div>
          <div className="font-mono font-semibold text-brand">Lucro {brl(atual)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{anteriorLabel}</div>
          <div className="font-mono">Receita {brl(receitaAnterior)}</div>
          <div className="font-mono">Lucro {brl(anterior)}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <span className={variaReceita >= 0 ? "text-brand" : "text-destructive"}>
          Receita {variaReceita >= 0 ? "▲" : "▼"} {pct(Math.abs(variaReceita))}
        </span>
        <span className={varia >= 0 ? "text-brand" : "text-destructive"}>
          Lucro {varia >= 0 ? "▲" : "▼"} {pct(Math.abs(varia))}
        </span>
      </div>
    </Card>
  );
}
