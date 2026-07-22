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

export function AdminDashboard() {
  const { user, role } = useAuth();
  const { data: company } = useCompany();
  const { mask } = useHideValues();
  const nome = user?.email?.split("@")[0] ?? "usuário";


  const desde = new Date();
  desde.setMonth(desde.getMonth() - 5);
  desde.setDate(1);
  const desdeStr = desde.toISOString().slice(0, 10);
  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesStr = inicioMes.toISOString().slice(0, 10);
  const em7dias = new Date();
  em7dias.setDate(em7dias.getDate() + 7);
  const em7Str = em7dias.toISOString().slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [lanc, viag, veic, mot, abast] = await Promise.all([
        supabase
          .from("financeiro_lancamentos")
          .select("tipo, valor, status, data_vencimento, data_pagamento, categoria")
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
    const mesLanc = data.lancamentos.filter((l) => (l.data_vencimento ?? "") >= inicioMesStr);
    const receitaMes = mesLanc.filter((l) => l.tipo === "receber").reduce((s, l) => s + Number(l.valor), 0);
    const despesaMes = mesLanc.filter((l) => l.tipo === "pagar").reduce((s, l) => s + Number(l.valor), 0);
    const lucroMes = receitaMes - despesaMes;

    const viagMes = data.viagens.filter((v) => (v.created_at ?? "") >= inicioMesStr);
    const kmMesViagens = viagMes.reduce((s, v) => s + Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0)), 0);
    const abastMes = data.abastecimentos.filter((a) => (a.data ?? "") >= inicioMesStr);
    const kmMesAbast = abastMes.reduce((s, a) => s + Number(a.km_percorridos ?? 0), 0);
    const kmMes = kmMesViagens > 0 ? kmMesViagens : kmMesAbast;

    const frotaAtiva = data.veiculos.filter((v) => v.ativo).length;
    const motoristasAtivos = data.motoristas.filter((m) => m.ativo).length;
    const emViagem = data.viagens.filter((v) => v.status === "em_andamento").length;

    // Consumo: apenas registros com km_percorridos > 0 (ignora o primeiro abastecimento de cada veículo)
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
    for (let i = 5; i >= 0; i--) {
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
    return Array.from(map.values());
  })();

  const custoVeiculo = (() => {
    if (!data) return [];
    const placas = new Map(data.veiculos.map((v) => [v.id, v.placa]));
    const map = new Map<string, { placa: string; combustivel: number }>();
    for (const a of data.abastecimentos) {
      if (!a.veiculo_id) continue;
      const placa = placas.get(a.veiculo_id) ?? "—";
      const cur = map.get(a.veiculo_id) ?? { placa, combustivel: 0 };
      cur.combustivel += Number(a.valor_total ?? 0);
      map.set(a.veiculo_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.combustivel - a.combustivel).slice(0, 8);
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
        <div className="flex items-center gap-2">
          {role && (
            <Badge variant="outline" className="border-brand/30 text-brand">
              Perfil: {roleLabel[role] ?? role}
            </Badge>
          )}
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
            <Kpi label="Receita (mês)" value={mask(brl(kpis.receitaMes))} delta="Vencimentos do mês" icon={DollarSign} />
            <Kpi label="Despesas (mês)" value={mask(brl(kpis.despesaMes))} delta="Vencimentos do mês" icon={TrendingDown} />
            <Kpi label="Resultado" value={mask(brl(kpis.lucroMes))} delta={kpis.lucroMes >= 0 ? "Positivo" : "Negativo"} icon={TrendingUp} highlight={kpis.lucroMes >= 0} />
            <Kpi label="KM rodados (mês)" value={`${kpis.kmMes.toLocaleString("pt-BR")} km`} delta={`${kpis.viagensMes} viagens`} icon={MapPin} />
          </div>


          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Kpi label="Frota ativa" value={String(kpis.frotaAtiva)} delta={`${kpis.emViagem} em viagem`} icon={Truck} />
            <Kpi label="Motoristas" value={String(kpis.motoristasAtivos)} delta="Ativos" icon={Users} />
            <Kpi label="Consumo médio" value={kpis.consumo > 0 ? `${kpis.consumo.toFixed(2)} km/L` : "—"} delta="Últimos 6 meses" icon={Fuel} />
            <Kpi label="Viagens (mês)" value={String(kpis.viagensMes)} delta={`${kpis.emViagem} em andamento`} icon={ArrowUpRight} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Receitas x Despesas</CardTitle>
                <CardDescription>Últimos 6 meses</CardDescription>
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
              <CardTitle>Combustível por veículo</CardTitle>
              <CardDescription>Gasto com abastecimento nos últimos 6 meses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                {custoVeiculo.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">Nenhum abastecimento registrado.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={custoVeiculo}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="placa" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => brl(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="combustivel" name="Combustível" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
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
