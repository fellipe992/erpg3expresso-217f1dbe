import { TrendingUp, TrendingDown, Truck, Users, MapPin, Fuel, DollarSign, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-company";
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

const roleLabel: Record<string, string> = {
  administrador: "Administrador",
  financeiro: "Financeiro",
  gestor: "Gestor",
};

const receitaDespesa = [
  { mes: "Jan", receita: 128000, despesa: 82000 },
  { mes: "Fev", receita: 142000, despesa: 88000 },
  { mes: "Mar", receita: 156000, despesa: 91000 },
  { mes: "Abr", receita: 148000, despesa: 94000 },
  { mes: "Mai", receita: 172000, despesa: 102000 },
  { mes: "Jun", receita: 189000, despesa: 108000 },
];

const custoVeiculo = [
  { placa: "ABC-1D23", combustivel: 12400, manutencao: 3200, pedagio: 1800 },
  { placa: "DEF-4G56", combustivel: 15200, manutencao: 4800, pedagio: 2100 },
  { placa: "GHI-7J89", combustivel: 10800, manutencao: 2400, pedagio: 1500 },
  { placa: "JKL-0M12", combustivel: 13600, manutencao: 5200, pedagio: 1900 },
];

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function AdminDashboard() {
  const { user, role } = useAuth();
  const { data: company } = useCompany();
  const nome = user?.email?.split("@")[0] ?? "usuário";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {/* Header */}
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
        {role && (
          <Badge variant="outline" className="w-fit border-brand/30 text-brand">
            Perfil: {roleLabel[role] ?? role}
          </Badge>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Receita (mês)" value={brl(189000)} delta="+9,8%" trend="up" icon={DollarSign} />
        <Kpi label="Despesas (mês)" value={brl(108000)} delta="+3,2%" trend="down-neutral" icon={TrendingDown} />
        <Kpi label="Lucro líquido" value={brl(81000)} delta="+18,4%" trend="up" icon={TrendingUp} highlight />
        <Kpi label="KM rodados" value="42.180 km" delta="+6,1%" trend="up" icon={MapPin} />
      </div>

      {/* Segunda linha */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Frota ativa" value="12" delta="2 em manutenção" trend="neutral" icon={Truck} />
        <Kpi label="Motoristas" value="18" delta="3 em viagem" trend="neutral" icon={Users} />
        <Kpi label="Consumo médio" value="3,4 km/L" delta="Meta: 3,2 km/L" trend="up" icon={Fuel} />
        <Kpi label="Viagens (mês)" value="87" delta="+12" trend="up" icon={ArrowUpRight} />
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Receitas x Despesas</CardTitle>
                <CardDescription>Últimos 6 meses</CardDescription>
              </div>
              <Badge variant="outline">Dados de exemplo</Badge>
            </div>
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
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => brl(v)}
                  />
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
            <CardDescription>Indicadores consolidados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <HealthRow label="Margem líquida" value="42,9%" tone="good" />
            <HealthRow label="Inadimplência" value="2,1%" tone="good" />
            <HealthRow label="Fluxo de caixa" value={brl(214000)} tone="good" />
            <HealthRow label="Contas a pagar (7d)" value={brl(38200)} tone="warn" />
            <HealthRow label="Contas a receber (7d)" value={brl(62400)} tone="good" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Custos por veículo</CardTitle>
          <CardDescription>Combustível, manutenção e pedágio no mês</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={custoVeiculo}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="placa" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--color-muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => brl(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="combustivel" name="Combustível" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="manutencao" name="Manutenção" fill="var(--color-graphite)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pedagio" name="Pedágio" fill="var(--color-muted-foreground)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        Fase 1 · Estrutura, auth e dashboard. Módulos operacionais chegam nas próximas fases.
      </p>
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  trend,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "down-neutral" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-destructive"
        : "text-muted-foreground";

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
        <div className={`mt-1 text-xs ${trendColor}`}>{delta}</div>
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
