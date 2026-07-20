import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, Loader2, TrendingUp, Truck, Users } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";


export const Route = createFileRoute("/_authenticated/app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — G3 Expresso" }] }),
  component: RelatoriosPage,
});

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CHART_COLORS = [
  "hsl(var(--brand))",
  "hsl(var(--destructive))",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#ec4899",
];

type Lanc = {
  id: string;
  tipo: "receber" | "pagar";
  valor: number;
  status: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  categoria: string | null;
  cliente_id: string | null;
  fornecedor_id: string | null;
};

type Viagem = {
  id: string;
  status: string;
  data_saida: string | null;
  data_chegada: string | null;
  km_inicial: number | null;
  km_final: number | null;
  valor_frete: number | null;
  motorista_id: string | null;
  veiculo_id: string | null;
  cliente_id: string | null;
};

function baixarCsv(nome: string, linhas: (string | number)[][]) {
  const csv = linhas
    .map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<"30d" | "90d" | "ano">("90d");
  const { role } = useAuth();
  const canSeeFinance = role === "administrador" || role === "financeiro";


  const desde = useMemo(() => {
    const d = new Date();
    if (periodo === "30d") d.setDate(d.getDate() - 30);
    else if (periodo === "90d") d.setDate(d.getDate() - 90);
    else d.setMonth(d.getMonth() - 12);
    return d.toISOString().slice(0, 10);
  }, [periodo]);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorios", desde],
    queryFn: async () => {
      const [lanc, viag, mot, vei, cli, forn] = await Promise.all([
        supabase
          .from("financeiro_lancamentos")
          .select("id, tipo, valor, status, data_vencimento, data_pagamento, categoria, cliente_id, fornecedor_id")
          .gte("data_vencimento", desde),
        supabase
          .from("viagens")
          .select("id, status, data_saida, data_chegada, km_inicial, km_final, valor_frete, motorista_id, veiculo_id, cliente_id")
          .gte("created_at", desde),
        supabase.from("motoristas").select("id, nome"),
        supabase.from("veiculos").select("id, placa, modelo"),
        supabase.from("clientes").select("id, razao_social"),
        supabase.from("fornecedores").select("id, razao_social"),
      ]);
      return {
        lancamentos: (lanc.data ?? []) as Lanc[],
        viagens: (viag.data ?? []) as Viagem[],
        motoristas: new Map(((mot.data ?? []) as { id: string; nome: string }[]).map((m) => [m.id, m.nome])),
        veiculos: new Map(
          ((vei.data ?? []) as { id: string; placa: string; modelo: string | null }[]).map((v) => [
            v.id,
            `${v.placa}${v.modelo ? ` · ${v.modelo}` : ""}`,
          ]),
        ),
        clientes: new Map(((cli.data ?? []) as { id: string; razao_social: string }[]).map((c) => [c.id, c.razao_social])),
        fornecedores: new Map(((forn.data ?? []) as { id: string; razao_social: string }[]).map((f) => [f.id, f.razao_social])),
      };
    },
  });

  const kpis = useMemo(() => {
    if (!data) return null;
    const receitas = data.lancamentos.filter((l) => l.tipo === "receber").reduce((s, l) => s + Number(l.valor), 0);
    const despesas = data.lancamentos.filter((l) => l.tipo === "pagar").reduce((s, l) => s + Number(l.valor), 0);
    const kmTotal = data.viagens.reduce(
      (s, v) => s + Math.max(0, (v.km_final ?? 0) - (v.km_inicial ?? 0)),
      0,
    );
    const concluidas = data.viagens.filter((v) => v.status === "concluida").length;
    return { receitas, despesas, saldo: receitas - despesas, kmTotal, concluidas, viagens: data.viagens.length };
  }, [data]);

  const porMotorista = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { nome: string; viagens: number; km: number; frete: number }>();
    for (const v of data.viagens) {
      if (!v.motorista_id) continue;
      const nome = data.motoristas.get(v.motorista_id) ?? "—";
      const cur = map.get(v.motorista_id) ?? { nome, viagens: 0, km: 0, frete: 0 };
      cur.viagens++;
      cur.km += Math.max(0, (v.km_final ?? 0) - (v.km_inicial ?? 0));
      cur.frete += Number(v.valor_frete ?? 0);
      map.set(v.motorista_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.viagens - a.viagens);
  }, [data]);

  const porVeiculo = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { nome: string; viagens: number; km: number }>();
    for (const v of data.viagens) {
      if (!v.veiculo_id) continue;
      const nome = data.veiculos.get(v.veiculo_id) ?? "—";
      const cur = map.get(v.veiculo_id) ?? { nome, viagens: 0, km: 0 };
      cur.viagens++;
      cur.km += Math.max(0, (v.km_final ?? 0) - (v.km_inicial ?? 0));
      map.set(v.veiculo_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.km - a.km);
  }, [data]);

  const topClientes = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { nome: string; total: number }>();
    for (const l of data.lancamentos) {
      if (l.tipo !== "receber" || !l.cliente_id) continue;
      const nome = data.clientes.get(l.cliente_id) ?? "—";
      const cur = map.get(l.cliente_id) ?? { nome, total: 0 };
      cur.total += Number(l.valor);
      map.set(l.cliente_id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [data]);

  const despesasPorCategoria = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const l of data.lancamentos) {
      if (l.tipo !== "pagar") continue;
      const cat = l.categoria || "Outros";
      map.set(cat, (map.get(cat) ?? 0) + Number(l.valor));
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [data]);

  const exportarFinanceiro = () => {
    if (!data) return;
    const linhas: (string | number)[][] = [
      ["Tipo", "Valor", "Status", "Vencimento", "Pagamento", "Categoria", "Cliente/Fornecedor"],
      ...data.lancamentos.map((l) => [
        l.tipo,
        Number(l.valor).toFixed(2),
        l.status,
        l.data_vencimento ?? "",
        l.data_pagamento ?? "",
        l.categoria ?? "",
        l.tipo === "receber"
          ? data.clientes.get(l.cliente_id ?? "") ?? ""
          : data.fornecedores.get(l.fornecedor_id ?? "") ?? "",
      ]),
    ];
    baixarCsv(`financeiro-${periodo}.csv`, linhas);
  };

  const exportarViagens = () => {
    if (!data) return;
    const linhas: (string | number)[][] = [
      ["Status", "Saída", "Chegada", "KM saída", "KM chegada", "KM rodado", "Frete", "Motorista", "Veículo", "Cliente"],
      ...data.viagens.map((v) => [
        v.status,
        v.data_saida ?? "",
        v.data_chegada ?? "",
        v.km_inicial ?? "",
        v.km_final ?? "",
        Math.max(0, (v.km_final ?? 0) - (v.km_inicial ?? 0)),
        Number(v.valor_frete ?? 0).toFixed(2),
        data.motoristas.get(v.motorista_id ?? "") ?? "",
        data.veiculos.get(v.veiculo_id ?? "") ?? "",
        data.clientes.get(v.cliente_id ?? "") ?? "",
      ]),
    ];
    baixarCsv(`viagens-${periodo}.csv`, linhas);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
            <BarChart3 className="size-5 text-brand" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Relatórios</h1>
            <p className="text-sm text-muted-foreground">Análise operacional e financeira consolidada</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["30d", "90d", "ano"] as const).map((p) => (
            <Button key={p} variant={periodo === p ? "default" : "outline"} size="sm" onClick={() => setPeriodo(p)}>
              {p === "30d" ? "30 dias" : p === "90d" ? "90 dias" : "12 meses"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading || !kpis ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Receitas</div>
              <div className="mt-1 font-display text-xl font-bold text-brand">{fmtBRL(kpis.receitas)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Despesas</div>
              <div className="mt-1 font-display text-xl font-bold text-destructive">{fmtBRL(kpis.despesas)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Saldo</div>
              <div className={`mt-1 font-display text-xl font-bold ${kpis.saldo >= 0 ? "text-brand" : "text-destructive"}`}>
                {fmtBRL(kpis.saldo)}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Viagens</div>
              <div className="mt-1 font-display text-xl font-bold">
                {kpis.concluidas}/{kpis.viagens}
              </div>
              <div className="text-xs text-muted-foreground">{kpis.kmTotal.toLocaleString("pt-BR")} km rodados</div>
            </Card>
          </div>

          <Tabs defaultValue="operacional">
            <TabsList>
              <TabsTrigger value="operacional">Operacional</TabsTrigger>
              <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
              <TabsTrigger value="exportar">Exportar</TabsTrigger>
            </TabsList>

            <TabsContent value="operacional" className="space-y-4">
              <Card className="p-4 md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Users className="size-4 text-brand" />
                  <h2 className="font-display font-bold">Desempenho por motorista</h2>
                </div>
                {porMotorista.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={porMotorista.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="nome" fontSize={11} />
                        <YAxis fontSize={11} />
                        <Tooltip contentStyle={{ borderRadius: 8, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                        <Legend />
                        <Bar dataKey="viagens" name="Viagens" fill="hsl(var(--brand))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="p-4 md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Truck className="size-4 text-brand" />
                  <h2 className="font-display font-bold">Km rodado por veículo</h2>
                </div>
                {porVeiculo.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2 text-left">Veículo</th>
                          <th className="py-2 text-right">Viagens</th>
                          <th className="py-2 text-right">Km</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {porVeiculo.slice(0, 10).map((v) => (
                          <tr key={v.nome}>
                            <td className="py-2">{v.nome}</td>
                            <td className="py-2 text-right font-mono">{v.viagens}</td>
                            <td className="py-2 text-right font-mono">{v.km.toLocaleString("pt-BR")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="financeiro" className="space-y-4">
              <Card className="p-4 md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="size-4 text-brand" />
                  <h2 className="font-display font-bold">Top clientes (receitas)</h2>
                </div>
                {topClientes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sem dados no período.</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topClientes} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} fontSize={11} />
                        <YAxis type="category" dataKey="nome" width={120} fontSize={11} />
                        <Tooltip
                          formatter={(v: number) => fmtBRL(v)}
                          contentStyle={{ borderRadius: 8, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                        />
                        <Bar dataKey="total" fill="hsl(var(--brand))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card className="p-4 md:p-6">
                <div className="mb-4">
                  <h2 className="font-display font-bold">Despesas por categoria</h2>
                </div>
                {despesasPorCategoria.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Sem despesas no período.</p>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={despesasPorCategoria}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={100}
                          paddingAngle={2}
                        >
                          {despesasPorCategoria.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => fmtBRL(v)}
                          contentStyle={{ borderRadius: 8, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                        />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="exportar" className="space-y-3">
              <Card className="p-4 md:p-6">
                <h2 className="font-display font-bold">Exportar dados (CSV)</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Baixe planilhas para análises externas no Excel ou Google Sheets. Período atual: {periodo}.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={exportarFinanceiro} variant="outline">
                    <Download className="mr-2 size-4" /> Financeiro
                  </Button>
                  <Button onClick={exportarViagens} variant="outline">
                    <Download className="mr-2 size-4" /> Viagens
                  </Button>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
