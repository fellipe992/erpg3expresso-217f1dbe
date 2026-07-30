import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Cenario } from "@/lib/roteirizacao/tipos";
import { calcularKpis, simularFinanceiro } from "@/lib/roteirizacao/kpis";
import { brl, duracao, km, num, pct } from "@/lib/roteirizacao/format";

const CORES = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{valor}</p>
    </Card>
  );
}

export function DashboardExecutivo({
  cenario,
  baseline,
  receita,
  impostoPct,
  administrativoPct,
}: {
  cenario: Cenario;
  baseline?: Cenario;
  receita?: number;
  impostoPct: number;
  administrativoPct: number;
}) {
  const kpis = calcularKpis(cenario);
  const fin = simularFinanceiro(cenario, { receita, impostoPct, administrativoPct });
  const economia = baseline ? Math.max(0, baseline.custo - cenario.custo) : 0;

  const porVeiculo = cenario.rotas.map((r) => ({
    nome: `${r.veiculo.nome} ${r.id.split("-").pop()}`,
    km: Math.round(r.km),
    peso: Math.round(r.pesoKg),
    horas: Number((r.minutos / 60).toFixed(1)),
    ocupacao: Math.round(r.ocupacaoPeso * 100),
    custo: Math.round(r.custo.total),
  }));

  const porRegiao = Object.entries(
    cenario.rotas
      .flatMap((r) => r.paradas)
      .reduce<Record<string, number>>((acc, p) => {
        const reg = p.entrega.regiao || p.entrega.endereco.split(",")[1]?.trim() || "Outros";
        acc[reg] = (acc[reg] ?? 0) + 1;
        return acc;
      }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const custos = [
    { nome: "Combustível", valor: cenario.custoDetalhado.combustivel },
    { nome: "Pedágio", valor: cenario.custoDetalhado.pedagio },
    { nome: "Motorista", valor: cenario.custoDetalhado.motorista + cenario.custoDetalhado.hora },
    { nome: "Manutenção", valor: cenario.custoDetalhado.manutencao },
    { nome: "Depreciação", valor: cenario.custoDetalhado.depreciacao },
    { nome: "Pneus", valor: cenario.custoDetalhado.pneus },
    { nome: "Seguro/Outros", valor: cenario.custoDetalhado.seguro + cenario.custoDetalhado.outros },
  ].map((c) => ({ ...c, valor: Math.round(c.valor) }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Receita prevista" valor={brl(fin.receita)} />
        <Kpi label="Custo operacional" valor={brl(fin.custoOperacional)} />
        <Kpi label="Lucro líquido" valor={brl(fin.lucroLiquido)} />
        <Kpi label="Margem" valor={pct(fin.margem, 1)} />
        <Kpi label="Custo por entrega" valor={brl(fin.custoPorEntrega)} />
        <Kpi label="Custo por km" valor={brl(fin.custoPorKm)} />
        <Kpi label="Custo por tonelada" valor={brl(fin.custoPorTonelada)} />
        <Kpi label="Economia da roteirização" valor={brl(economia)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h4 className="mb-3 text-sm font-semibold">Quilometragem e peso por veículo</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porVeiculo}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="nome" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-popover-foreground)" }} />
              <Legend />
              <Bar dataKey="km" name="KM" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="peso" name="Peso (kg)" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h4 className="mb-3 text-sm font-semibold">Tempo e ocupação por veículo</h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porVeiculo}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="nome" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-popover-foreground)" }} />
              <Legend />
              <Bar dataKey="horas" name="Horas" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ocupacao" name="Ocupação (%)" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h4 className="mb-3 text-sm font-semibold">Entregas por região</h4>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={porRegiao} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                {porRegiao.map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-popover-foreground)" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h4 className="mb-3 text-sm font-semibold">Custos operacionais</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={custos} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="nome" width={100} stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-popover-foreground)" }} />
              <Bar dataKey="valor" name="R$" fill="var(--color-brand)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-4">
        <h4 className="mb-3 text-sm font-semibold">Indicadores logísticos</h4>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Kpi label="Entregas por hora" valor={num(kpis.entregasPorHora, 1)} />
          <Kpi label="Entregas por veículo" valor={num(kpis.entregasPorVeiculo, 1)} />
          <Kpi label="KM por entrega" valor={num(kpis.kmPorEntrega, 1)} />
          <Kpi label="KM por litro" valor={num(kpis.kmPorLitro, 1)} />
          <Kpi label="Peso médio" valor={`${num(kpis.pesoMedioKg)} kg`} />
          <Kpi label="Tempo médio por entrega" valor={duracao(kpis.tempoMedioEntregaMin)} />
          <Kpi label="Tempo de deslocamento" valor={duracao(kpis.tempoDeslocamentoMin)} />
          <Kpi label="Tempo parado" valor={duracao(kpis.tempoParadoMin)} />
          <Kpi label="Distância total" valor={km(kpis.km)} />
          <Kpi label="Eficiência da operação" valor={pct(kpis.eficiencia)} />
        </div>
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Taxa de ocupação da frota</span>
            <span className="font-medium">{pct(kpis.ocupacaoFrota)}</span>
          </div>
          <Progress value={Math.min(100, kpis.ocupacaoFrota * 100)} />
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Índice de aproveitamento dos veículos</span>
            <span className="font-medium">{pct(kpis.aproveitamento)}</span>
          </div>
          <Progress value={Math.min(100, kpis.aproveitamento * 100)} />
        </div>
      </Card>
    </div>
  );
}
