import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, TrendingDown, AlertCircle, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/app/financeiro")({
  head: () => ({ meta: [{ title: "Fluxo de Caixa — G3 Expresso" }] }),
  component: FinanceiroPage,
});

type Row = {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: "pendente" | "pago" | "atrasado" | "cancelado";
};

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function FinanceiroPage() {
  const [periodo, setPeriodo] = useState<"30d" | "90d" | "ano">("90d");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["financeiro-all"],
    queryFn: async () => {
      await supabase.rpc("marcar_atrasados");
      const { data, error } = await supabase
        .from("financeiro_lancamentos")
        .select("id, tipo, descricao, valor, data_vencimento, data_pagamento, status")
        .neq("status", "cancelado")
        .order("data_vencimento");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const stats = useMemo(() => {
    const s = {
      totalReceber: 0,
      totalPagar: 0,
      recebido: 0,
      pago: 0,
      atrasadoReceber: 0,
      atrasadoPagar: 0,
      pendenteReceber: 0,
      pendentePagar: 0,
    };
    for (const r of rows) {
      const v = Number(r.valor);
      if (r.tipo === "receber") {
        s.totalReceber += v;
        if (r.status === "pago") s.recebido += v;
        else if (r.status === "atrasado") s.atrasadoReceber += v;
        else if (r.status === "pendente") s.pendenteReceber += v;
      } else {
        s.totalPagar += v;
        if (r.status === "pago") s.pago += v;
        else if (r.status === "atrasado") s.atrasadoPagar += v;
        else if (r.status === "pendente") s.pendentePagar += v;
      }
    }
    return s;
  }, [rows]);

  // Dados para gráfico mensal
  const chartData = useMemo(() => {
    const monthsBack = periodo === "30d" ? 1 : periodo === "90d" ? 3 : 12;
    const map = new Map<string, { mes: string; receitas: number; despesas: number; saldo: number }>();
    const today = new Date();
    for (let i = monthsBack; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, {
        mes: d.toLocaleDateString("pt-BR", { month: "short" }),
        receitas: 0,
        despesas: 0,
        saldo: 0,
      });
    }
    for (const r of rows) {
      const ref = r.data_pagamento ?? r.data_vencimento;
      if (!ref) continue;
      const key = ref.slice(0, 7);
      const bucket = map.get(key);
      if (!bucket) continue;
      const v = Number(r.valor);
      if (r.tipo === "receber") bucket.receitas += v;
      else bucket.despesas += v;
    }
    for (const b of map.values()) b.saldo = b.receitas - b.despesas;
    return Array.from(map.values());
  }, [rows, periodo]);

  const proximosVencer = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return rows
      .filter((r) => r.status !== "pago" && r.data_vencimento != null && r.data_vencimento >= hoje)
      .sort((a, b) => (a.data_vencimento ?? "").localeCompare(b.data_vencimento ?? ""))
      .slice(0, 6);
  }, [rows]);

  const saldoProjetado = stats.totalReceber - stats.totalPagar;
  const saldoRealizado = stats.recebido - stats.pago;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
            <Wallet className="size-5 text-brand" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Fluxo de Caixa</h1>
            <p className="text-sm text-muted-foreground">Visão consolidada de receitas e despesas</p>
          </div>
        </div>
        <div className="flex gap-2">
          {(["30d", "90d", "ano"] as const).map((p) => (
            <Button key={p} variant={periodo === p ? "default" : "outline"} size="sm" onClick={() => setPeriodo(p)}>
              {p === "30d" ? "30 dias" : p === "90d" ? "90 dias" : "12 meses"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 md:grid-cols-4">
            <Kpi
              icon={TrendingUp}
              label="A receber"
              value={fmtBRL(stats.pendenteReceber + stats.atrasadoReceber)}
              sub={`${fmtBRL(stats.recebido)} recebido`}
              tone="success"
            />
            <Kpi
              icon={TrendingDown}
              label="A pagar"
              value={fmtBRL(stats.pendentePagar + stats.atrasadoPagar)}
              sub={`${fmtBRL(stats.pago)} pago`}
              tone="danger"
            />
            <Kpi
              icon={Wallet}
              label="Saldo projetado"
              value={fmtBRL(saldoProjetado)}
              sub={`Realizado: ${fmtBRL(saldoRealizado)}`}
              tone={saldoProjetado >= 0 ? "success" : "danger"}
            />
            <Kpi
              icon={AlertCircle}
              label="Atrasados"
              value={fmtBRL(stats.atrasadoReceber + stats.atrasadoPagar)}
              sub={`${fmtBRL(stats.atrasadoReceber)} receber · ${fmtBRL(stats.atrasadoPagar)} pagar`}
              tone="danger"
            />
          </div>

          {/* Gráfico */}
          <Card className="p-4 md:p-6">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold">Receitas × Despesas</h2>
              <p className="text-xs text-muted-foreground">Por competência (vencimento ou pagamento)</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="mes" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    formatter={(v: number) => fmtBRL(v)}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}
                  />
                  <Legend />
                  <Bar dataKey="receitas" name="Receitas" fill="hsl(var(--brand))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Próximos vencimentos */}
          <Card>
            <div className="border-b border-border/60 p-4 md:p-6">
              <h2 className="font-display text-lg font-bold">Próximos vencimentos</h2>
            </div>
            {proximosVencer.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Sem lançamentos futuros.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {proximosVencer.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={r.tipo === "receber" ? "default" : "outline"}>
                          {r.tipo === "receber" ? "Receber" : "Pagar"}
                        </Badge>
                        <span className="truncate font-medium">{r.descricao}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Vence em {new Date((r.data_vencimento ?? "") + "T00:00:00").toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <div className={`font-mono font-semibold ${r.tipo === "receber" ? "text-brand" : "text-destructive"}`}>
                      {r.tipo === "receber" ? "+" : "−"} {fmtBRL(Number(r.valor))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
}) {
  const color = tone === "success" ? "text-brand" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${color}`} />
      </div>
      <div className={`mt-2 font-display text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
