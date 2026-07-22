import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Truck, Users, MapPin, Fuel, DollarSign, ArrowUpRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
import { useHideValues, HideValuesToggle } from "@/hooks/use-hide-values";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VeiculoDrilldownDialog, type VeiculoDrilldownState } from "@/components/dashboards/veiculo-drilldown-dialog";

const roleLabel: Record<string, string> = {
  administrador: "Administrador",
  financeiro: "Financeiro",
  gestor: "Gestor",
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

type PeriodKey = "15d" | "30d" | "60d" | "90d" | "12m";
const PERIOD_OPTIONS: { value: PeriodKey; label: string; days: number; buckets: number; bucket: "day" | "month" }[] = [
  { value: "15d", label: "Últimos 15 dias", days: 15, buckets: 15, bucket: "day" },
  { value: "30d", label: "Últimos 30 dias", days: 30, buckets: 30, bucket: "day" },
  { value: "60d", label: "Últimos 60 dias", days: 60, buckets: 8, bucket: "day" },
  { value: "90d", label: "Últimos 90 dias", days: 90, buckets: 12, bucket: "day" },
  { value: "12m", label: "Últimos 12 meses", days: 365, buckets: 12, bucket: "month" },
];

export function AdminDashboard() {
  const { user, role } = useAuth();
  const { data: company } = useCompany();
  const { mask } = useHideValues();
  const nome = user?.email?.split("@")[0] ?? "usuário";
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [drilldown, setDrilldown] = useState<VeiculoDrilldownState>(null);
  const cfg = PERIOD_OPTIONS.find((p) => p.value === period)!;

  const desde = useMemo(() => {
    const d = new Date();
    if (cfg.bucket === "month") {
      d.setMonth(d.getMonth() - 11);
      d.setDate(1);
    } else {
      d.setDate(d.getDate() - (cfg.days - 1));
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }, [cfg]);
  const desdeStr = desde.toISOString().slice(0, 10);
  const inicioPeriodoStr = desdeStr;
  const em7dias = new Date();
  em7dias.setDate(em7dias.getDate() + 7);
  const em7Str = em7dias.toISOString().slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard", period],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [lanc, viag, veic, mot, abast] = await Promise.all([
        supabase
          .from("financeiro_lancamentos")
          .select("tipo, valor, status, data_vencimento, data_pagamento, categoria, veiculo_id")
          .gte("data_vencimento", desdeStr),
        supabase
          .from("viagens")
          .select("id, status, data_saida, km_inicial, km_final, veiculo_id, created_at")
          .gte("created_at", desdeStr),
        supabase.from("veiculos").select("id, placa, ativo"),
        supabase.from("motoristas").select("id, ativo, veiculo_id"),
        supabase
          .from("abastecimentos")
          .select("veiculo_id, valor_total, litros, km_percorridos, data")
          .gte("data", desdeStr),
      ]);
      return {
        lancamentos: lanc.data ?? [],
        viagens: viag.data ?? [],
        veiculos: veic.data ?? [],
        motoristas: mot.data ?? [],
        abastecimentos: abast.data ?? [],
      };
    },
  });

  const kpis = (() => {
    if (!data) return null;
    const mesLanc = data.lancamentos.filter((l) => (l.data_vencimento ?? "") >= inicioPeriodoStr);
    const receitaMes = mesLanc.filter((l) => l.tipo === "receber").reduce((s, l) => s + Number(l.valor), 0);
    const despesaMes = mesLanc.filter((l) => l.tipo === "pagar").reduce((s, l) => s + Number(l.valor), 0);
    const lucroMes = receitaMes - despesaMes;

    const viagMes = data.viagens.filter((v) => (v.created_at ?? "") >= inicioPeriodoStr);
    const kmMesViagens = viagMes.reduce((s, v) => s + Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0)), 0);
    const abastMes = data.abastecimentos.filter((a) => (a.data ?? "") >= inicioPeriodoStr);
    const kmMesAbast = abastMes.reduce((s, a) => s + Number(a.km_percorridos ?? 0), 0);
    const kmMes = kmMesViagens > 0 ? kmMesViagens : kmMesAbast;

    const frotaAtiva = data.veiculos.filter((v) => v.ativo).length;
    const motoristasAtivos = data.motoristas.filter((m) => m.ativo).length;
    const emViagem = data.viagens.filter((v) => v.status === "em_andamento").length;

    const abastValidos = data.abastecimentos.filter((a) => Number(a.km_percorridos ?? 0) > 0 && Number(a.litros ?? 0) > 0);
    const totLitros = abastValidos.reduce((s, a) => s + Number(a.litros), 0);
    const totKmAbast = abastValidos.reduce((s, a) => s + Number(a.km_percorridos ?? 0), 0);
    const consumo = totLitros > 0 && totKmAbast > 0 ? totKmAbast / totLitros : 0;

    const contasReceber7d = data.lancamentos
      .filter((l) => l.tipo === "receber" && l.status !== "pago" && l.data_vencimento != null && l.data_vencimento >= hoje && l.data_vencimento <= em7Str)
      .reduce((s, l) => s + Number(l.valor), 0);
    const contasPagar7d = data.lancamentos
      .filter((l) => l.tipo === "pagar" && l.status !== "pago" && l.data_vencimento != null && l.data_vencimento >= hoje && l.data_vencimento <= em7Str)
      .reduce((s, l) => s + Number(l.valor), 0);
    const inadimplencia = data.lancamentos
      .filter((l) => l.tipo === "receber" && l.status === "atrasado")
      .reduce((s, l) => s + Number(l.valor), 0);

    return {
      receitaMes, despesaMes, lucroMes, kmMes,
      frotaAtiva, motoristasAtivos, emViagem, viagensMes: viagMes.length,
      consumo, contasReceber7d, contasPagar7d, inadimplencia,
    };
  })();

  const receitaDespesa = (() => {
    if (!data) return [];
    const map = new Map<string, { mes: string; receita: number; despesa: number }>();
    if (cfg.bucket === "month") {
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const k = monthKey(d);
        map.set(k, { mes: monthLabel(k), receita: 0, despesa: 0 });
      }
      for (const l of data.lancamentos) {
        if (!l.data_vencimento) continue;
        const k = l.data_vencimento.slice(0, 7);
        const cur = map.get(k);
        if (!cur) continue;
        if (l.tipo === "receber") cur.receita += Number(l.valor);
        else cur.despesa += Number(l.valor);
      }
    } else {
      // Baldes diários agrupados para caber em ~cfg.buckets pontos no gráfico
      const groupDays = Math.max(1, Math.ceil(cfg.days / cfg.buckets));
      for (let i = cfg.buckets - 1; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i * groupDays);
        const k = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
        map.set(k, { mes: label, receita: 0, despesa: 0 });
      }
      const keys = Array.from(map.keys()).sort();
      for (const l of data.lancamentos) {
        if (!l.data_vencimento) continue;
        const ref = l.data_vencimento.slice(0, 10);
        let bucketKey = keys[0];
        for (const k of keys) {
          if (ref >= k) bucketKey = k;
          else break;
        }
        const cur = map.get(bucketKey);
        if (!cur) continue;
        if (l.tipo === "receber") cur.receita += Number(l.valor);
        else cur.despesa += Number(l.valor);
      }
    }
    return Array.from(map.values());
  })();

  const consumoPorVeiculo = (() => {
    if (!data) return [];
    const placas = new Map(data.veiculos.map((v) => [v.id, v.placa]));
    const map = new Map<string, { placa: string; litros: number; km: number; gasto: number }>();
    for (const a of data.abastecimentos) {
      if (!a.veiculo_id) continue;
      const placa = placas.get(a.veiculo_id) ?? "—";
      const cur = map.get(a.veiculo_id) ?? { placa, litros: 0, km: 0, gasto: 0 };
      cur.gasto += Number(a.valor_total ?? 0);
      if (Number(a.km_percorridos ?? 0) > 0 && Number(a.litros ?? 0) > 0) {
        cur.litros += Number(a.litros);
        cur.km += Number(a.km_percorridos);
      }
      map.set(a.veiculo_id, cur);
    }
    return Array.from(map.values())
      .map((v) => ({
        ...v,
        consumo: v.litros > 0 ? v.km / v.litros : 0,
        custoKm: v.km > 0 ? v.gasto / v.km : 0,
      }))
      .sort((a, b) => b.gasto - a.gasto);
  })();

  // Categorias fixas de despesa por veículo (empilhado)
  const CATEGORIAS_DESP = ["Combustível", "Manutenção", "Pedágio", "Outros"] as const;
  function normalizarCategoria(c: string | null | undefined) {
    const s = (c ?? "").toLowerCase();
    if (s.includes("combust")) return "Combustível";
    if (s.includes("manut")) return "Manutenção";
    if (s.includes("pedág") || s.includes("pedag")) return "Pedágio";
    return "Outros";
  }
  type DespesaRow = { veiculo_id: string; placa: string; total: number; Combustível: number; Manutenção: number; Pedágio: number; Outros: number };
  const despesasPorVeiculo = (() => {
    if (!data) return [] as DespesaRow[];
    const placas = new Map(data.veiculos.map((v) => [v.id, v.placa]));
    const map = new Map<string, DespesaRow>();
    for (const l of data.lancamentos) {
      if (l.tipo !== "pagar" || !l.veiculo_id) continue;
      const placa = placas.get(l.veiculo_id) ?? "—";
      const cur = map.get(l.veiculo_id) ?? { veiculo_id: l.veiculo_id, placa, total: 0, Combustível: 0, Manutenção: 0, Pedágio: 0, Outros: 0 };
      const cat = normalizarCategoria(l.categoria) as "Combustível" | "Manutenção" | "Pedágio" | "Outros";
      cur[cat] = cur[cat] + Number(l.valor ?? 0);
      cur.total += Number(l.valor ?? 0);
      map.set(l.veiculo_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  })();

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            {company?.nome_fantasia ?? "G3 Expresso"}
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Bem-vindo, <span className="capitalize">{nome}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão consolidada da operação e do financeiro.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {role && (
            <Badge variant="outline" className="border-brand/30 text-brand">
              Perfil: {roleLabel[role] ?? role}
            </Badge>
          )}
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <HideValuesToggle />
        </div>
      </div>

      {isLoading || !kpis ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label={`Receita (${cfg.label.toLowerCase()})`} value={mask(brl(kpis.receitaMes))} delta="Vencimentos no período" icon={DollarSign} />
            <Kpi label={`Despesas (${cfg.label.toLowerCase()})`} value={mask(brl(kpis.despesaMes))} delta="Vencimentos no período" icon={TrendingDown} />
            <Kpi label="Resultado" value={mask(brl(kpis.lucroMes))} delta={kpis.lucroMes >= 0 ? "Positivo" : "Negativo"} icon={TrendingUp} highlight={kpis.lucroMes >= 0} />
            <Kpi label="KM rodados" value={`${kpis.kmMes.toLocaleString("pt-BR")} km`} delta={`${kpis.viagensMes} viagens`} icon={MapPin} />
          </div>


          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Frota ativa" value={String(kpis.frotaAtiva)} delta={`${kpis.emViagem} em viagem`} icon={Truck} />
            <Kpi label="Motoristas" value={String(kpis.motoristasAtivos)} delta="Ativos" icon={Users} />
            <Kpi label="Consumo médio" value={kpis.consumo > 0 ? `${kpis.consumo.toFixed(2)} km/L` : "—"} delta={cfg.label} icon={Fuel} />
            <Kpi label="Viagens" value={String(kpis.viagensMes)} delta={`${kpis.emViagem} em andamento`} icon={ArrowUpRight} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Receitas x Despesas</CardTitle>
                <CardDescription>{cfg.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={receitaDespesa} margin={{ left: -8, right: 8, top: 8 }}>
                      <defs>
                        <linearGradient id="rec" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="des" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-muted-foreground)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="var(--color-muted-foreground)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => brl(v)} />
                      <Area type="monotone" dataKey="receita" stroke="var(--color-brand)" strokeWidth={2} fill="url(#rec)" name="Receita" />
                      <Area type="monotone" dataKey="despesa" stroke="var(--color-muted-foreground)" strokeWidth={2} fill="url(#des)" name="Despesa" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saúde financeira</CardTitle>
                <CardDescription>Indicadores em tempo real</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <HealthRow label="Contas a receber (7d)" value={mask(brl(kpis.contasReceber7d))} tone="good" />
                <HealthRow label="Contas a pagar (7d)" value={mask(brl(kpis.contasPagar7d))} tone="warn" />
                <HealthRow label="Inadimplência" value={mask(brl(kpis.inadimplencia))} tone={kpis.inadimplencia > 0 ? "bad" : "good"} />
                <HealthRow label="Resultado do mês" value={mask(brl(kpis.lucroMes))} tone={kpis.lucroMes >= 0 ? "good" : "bad"} />

              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Despesas por veículo</CardTitle>
              <CardDescription>
                Clique em uma barra para ver lançamentos e viagens — {cfg.label.toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {despesasPorVeiculo.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">Nenhuma despesa registrada.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={despesasPorVeiculo}
                      onClick={(e) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const payload = (e as any)?.activePayload?.[0]?.payload as DespesaRow | undefined;
                        if (payload?.veiculo_id) {
                          setDrilldown({ veiculoId: payload.veiculo_id, placa: payload.placa, desde: desdeStr });
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="placa" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12, color: "var(--color-popover-foreground)" }} formatter={(v: number) => brl(v)} cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Combustível" stackId="a" fill="var(--color-brand)" cursor="pointer" />
                      <Bar dataKey="Manutenção" stackId="a" fill="var(--color-chart-2)" cursor="pointer" />
                      <Bar dataKey="Pedágio" stackId="a" fill="var(--color-warning)" cursor="pointer" />
                      <Bar dataKey="Outros" stackId="a" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} cursor="pointer" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle>Consumo por veículo</CardTitle>
              <CardDescription>Média km/L, gasto com combustível e custo por km — {cfg.label.toLowerCase()}</CardDescription>
            </CardHeader>
            <CardContent>
              {consumoPorVeiculo.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhum abastecimento registrado no período.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Placa</TableHead>
                      <TableHead className="text-right">Litros</TableHead>
                      <TableHead className="text-right">KM</TableHead>
                      <TableHead className="text-right">Consumo</TableHead>
                      <TableHead className="text-right">R$/km</TableHead>
                      <TableHead className="text-right">Gasto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consumoPorVeiculo.map((v) => (
                      <TableRow key={v.placa}>
                        <TableCell className="font-mono text-xs">{v.placa}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.km.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.consumo > 0 ? `${v.consumo.toFixed(2)} km/L` : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{v.custoKm > 0 ? brl(v.custoKm) : "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{mask(brl(v.gasto))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <VeiculoDrilldownDialog state={drilldown} onOpenChange={(open) => !open && setDrilldown(null)} />
    </div>
  );
}


function Kpi({
  label,
  value,
  delta,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  delta: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-brand/40 bg-brand-subtle" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          <Icon className={`size-4 ${highlight ? "text-brand" : "text-muted-foreground"}`} />
        </div>
        <div className={`mt-2 font-display text-2xl font-bold tabular-nums ${highlight ? "text-brand" : ""}`}>
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{delta}</div>
      </CardContent>
    </Card>
  );
}

function HealthRow({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" }) {
  const dot = tone === "good" ? "bg-success" : tone === "warn" ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`size-1.5 rounded-full ${dot}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="font-display text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
