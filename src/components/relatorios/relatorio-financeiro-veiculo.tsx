import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Truck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortHead, useSort } from "@/components/ui/sortable";
import { KpiCard, SecaoVazia } from "@/components/relatorios/kpi-card";
import { FiltrosFinanceiros, filtrosIniciais, type FiltrosFin } from "@/components/relatorios/filtros-financeiros";
import { useBiDados, rotuloMes } from "@/hooks/use-bi-dados";
import { brl, dt, exportarExcel, exportarPdf, num } from "@/lib/export-utils";

type LinhaVeiculo = {
  veiculoId: string;
  veiculo: string;
  placa: string;
  viagens: number;
  receita: number;
  recebido: number;
  pendente: number;
  atrasado: number;
  despesas: number;
  km: number;
  mediaPorViagem: number;
  receitaMensal: number;
  receitaAnual: number;
};

export function RelatorioFinanceiroVeiculo() {
  const [filtros, setFiltros] = useState<FiltrosFin>(() => filtrosIniciais(90));
  const { data, isLoading, isFetching } = useBiDados(filtros.de, filtros.ate);

  const meses = useMemo(() => {
    const a = new Date(`${filtros.de}T00:00:00`);
    const b = new Date(`${filtros.ate}T00:00:00`);
    return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1);
  }, [filtros.de, filtros.ate]);

  const linhas = useMemo<LinhaVeiculo[]>(() => {
    if (!data) return [];
    const q = filtros.busca.trim().toLowerCase();
    const map = new Map<string, LinhaVeiculo>();

    for (const v of data.viagens) {
      if (!v.veiculo_id || v.status === "cancelada") continue;
      if (filtros.veiculoId !== "todos" && v.veiculo_id !== filtros.veiculoId) continue;
      if (q && !v.veiculo.toLowerCase().includes(q) && !v.placa.toLowerCase().includes(q)) continue;
      const cur =
        map.get(v.veiculo_id) ??
        ({
          veiculoId: v.veiculo_id,
          veiculo: v.veiculo,
          placa: v.placa,
          viagens: 0,
          receita: 0,
          recebido: 0,
          pendente: 0,
          atrasado: 0,
          despesas: 0,
          km: 0,
          mediaPorViagem: 0,
          receitaMensal: 0,
          receitaAnual: 0,
        } as LinhaVeiculo);
      cur.viagens += 1;
      cur.receita += v.receita;
      cur.recebido += v.recebido;
      cur.pendente += v.pendente;
      cur.atrasado += v.atrasado;
      cur.despesas += v.despesas;
      cur.km += v.km;
      map.set(v.veiculo_id, cur);
    }

    // Despesas do veículo sem viagem vinculada
    for (const l of data.lancamentos) {
      if (l.tipo !== "pagar" || !l.veiculo_id || l.viagem_id) continue;
      if (filtros.veiculoId !== "todos" && l.veiculo_id !== filtros.veiculoId) continue;
      const cur = map.get(l.veiculo_id);
      if (cur) cur.despesas += l.valor;
    }

    return Array.from(map.values())
      .map((r) => ({
        ...r,
        mediaPorViagem: r.viagens ? r.receita / r.viagens : 0,
        receitaMensal: r.receita / meses,
        receitaAnual: (r.receita / meses) * 12,
      }))
      .sort((a, b) => b.receita - a.receita);
  }, [data, filtros, meses]);

  const acc = {
    veiculo: (r: LinhaVeiculo) => r.veiculo,
    placa: (r: LinhaVeiculo) => r.placa,
    viagens: (r: LinhaVeiculo) => r.viagens,
    receita: (r: LinhaVeiculo) => r.receita,
    recebido: (r: LinhaVeiculo) => r.recebido,
    pendente: (r: LinhaVeiculo) => r.pendente,
    atrasado: (r: LinhaVeiculo) => r.atrasado,
    despesas: (r: LinhaVeiculo) => r.despesas,
    km: (r: LinhaVeiculo) => r.km,
    media: (r: LinhaVeiculo) => r.mediaPorViagem,
    mensal: (r: LinhaVeiculo) => r.receitaMensal,
    anual: (r: LinhaVeiculo) => r.receitaAnual,
  };
  const { sorted, sort, toggle } = useSort(linhas, acc, { key: "receita", dir: "desc" });

  const totais = linhas.reduce(
    (a, r) => ({
      receita: a.receita + r.receita,
      recebido: a.recebido + r.recebido,
      pendente: a.pendente + r.pendente,
      atrasado: a.atrasado + r.atrasado,
      despesas: a.despesas + r.despesas,
      viagens: a.viagens + r.viagens,
      km: a.km + r.km,
    }),
    { receita: 0, recebido: 0, pendente: 0, atrasado: 0, despesas: 0, viagens: 0, km: 0 },
  );

  const serieMensal = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { mes: string; receita: number; despesas: number }>();
    for (const v of data.viagens) {
      if (!v.veiculo_id || v.status === "cancelada") continue;
      if (filtros.veiculoId !== "todos" && v.veiculo_id !== filtros.veiculoId) continue;
      const key = v.ref.slice(0, 7);
      const b = map.get(key) ?? { mes: rotuloMes(key), receita: 0, despesas: 0 };
      b.receita += v.receita;
      b.despesas += v.despesas;
      map.set(key, b);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }, [data, filtros.veiculoId]);

  const colunas = [
    "Veículo",
    "Placa",
    "Viagens",
    "Receita",
    "Recebido",
    "Pendente",
    "Em atraso",
    "Despesas",
    "KM",
    "Média por viagem",
    "Receita mensal",
    "Receita anual",
  ];
  const linhasExport = sorted.map((r) => [
    r.veiculo,
    r.placa,
    r.viagens,
    r.receita,
    r.recebido,
    r.pendente,
    r.atrasado,
    r.despesas,
    r.km,
    r.mediaPorViagem,
    r.receitaMensal,
    r.receitaAnual,
  ]);

  return (
    <div className="space-y-4">
      <FiltrosFinanceiros
        value={filtros}
        onChange={setFiltros}
        dados={data}
        mostrar={["periodo", "empresa", "veiculo", "busca"]}
        buscaPlaceholder="Placa ou modelo…"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Receita gerada" value={brl(totais.receita)} tone="brand" icon={Truck} />
        <KpiCard label="Recebido" value={brl(totais.recebido)} tone="success" />
        <KpiCard label="Pendente" value={brl(totais.pendente)} />
        <KpiCard label="Em atraso" value={brl(totais.atrasado)} tone="danger" />
        <KpiCard
          label="Viagens"
          value={String(totais.viagens)}
          sub={`${num(totais.km, 0)} km · ${totais.viagens ? brl(totais.receita / totais.viagens) : brl(0)} por viagem`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportarExcel(`financeiro-por-veiculo-${filtros.de}_${filtros.ate}.xlsx`, [
              { nome: "Por veículo", colunas, linhas: linhasExport },
            ])
          }
        >
          <FileSpreadsheet className="mr-2 size-4" /> Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportarPdf({
              nomeArquivo: `financeiro-por-veiculo-${filtros.de}_${filtros.ate}.pdf`,
              titulo: "Relatório financeiro por veículo",
              subtitulo: "G3 Expresso",
              filtros: [
                `Período ${dt(filtros.de)} a ${dt(filtros.ate)}`,
                `Veículo: ${filtros.veiculoId === "todos" ? "Todos" : data?.nomeVeiculo(filtros.veiculoId) ?? "—"}`,
              ],
              kpis: [
                ["Receita", brl(totais.receita)],
                ["Recebido", brl(totais.recebido)],
                ["Pendente", brl(totais.pendente)],
                ["Em atraso", brl(totais.atrasado)],
                ["Viagens", String(totais.viagens)],
              ],
              secoes: [
                {
                  colunas,
                  linhas: sorted.map((r) => [
                    r.veiculo,
                    r.placa,
                    r.viagens,
                    brl(r.receita),
                    brl(r.recebido),
                    brl(r.pendente),
                    brl(r.atrasado),
                    brl(r.despesas),
                    num(r.km, 0),
                    brl(r.mediaPorViagem),
                    brl(r.receitaMensal),
                    brl(r.receitaAnual),
                  ]),
                },
              ],
            })
          }
        >
          <FileText className="mr-2 size-4" /> PDF
        </Button>
        {isFetching && <Loader2 className="size-4 animate-spin self-center text-brand" />}
      </div>

      <Card className="p-4 md:p-6">
        <h3 className="mb-4 font-display font-bold">Receita × despesas por mês</h3>
        {serieMensal.length === 0 ? (
          <SecaoVazia />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serieMensal}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => brl(v)}
                  contentStyle={{ borderRadius: 8, background: "var(--color-card)", border: "1px solid var(--color-border)" }}
                />
                <Legend />
                <Bar dataKey="receita" name="Receita" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="var(--color-destructive)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="size-6 animate-spin text-brand" />
          </div>
        ) : sorted.length === 0 ? (
          <SecaoVazia />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead sortKey="veiculo" sort={sort} onToggle={toggle}>Veículo</SortHead>
                  <SortHead sortKey="placa" sort={sort} onToggle={toggle}>Placa</SortHead>
                  <SortHead sortKey="viagens" sort={sort} onToggle={toggle} align="right">Viagens</SortHead>
                  <SortHead sortKey="receita" sort={sort} onToggle={toggle} align="right">Receita</SortHead>
                  <SortHead sortKey="recebido" sort={sort} onToggle={toggle} align="right">Recebido</SortHead>
                  <SortHead sortKey="pendente" sort={sort} onToggle={toggle} align="right">Pendente</SortHead>
                  <SortHead sortKey="atrasado" sort={sort} onToggle={toggle} align="right">Em atraso</SortHead>
                  <SortHead sortKey="despesas" sort={sort} onToggle={toggle} align="right">Despesas</SortHead>
                  <SortHead sortKey="km" sort={sort} onToggle={toggle} align="right">KM</SortHead>
                  <SortHead sortKey="media" sort={sort} onToggle={toggle} align="right">Média/viagem</SortHead>
                  <SortHead sortKey="mensal" sort={sort} onToggle={toggle} align="right">Receita mensal</SortHead>
                  <SortHead sortKey="anual" sort={sort} onToggle={toggle} align="right">Receita anual</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.veiculoId}>
                    <TableCell className="font-medium">{r.veiculo}</TableCell>
                    <TableCell className="font-mono text-xs">{r.placa}</TableCell>
                    <TableCell className="text-right font-mono">{r.viagens}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{brl(r.receita)}</TableCell>
                    <TableCell className="text-right font-mono text-brand">{brl(r.recebido)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.pendente)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{brl(r.atrasado)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.despesas)}</TableCell>
                    <TableCell className="text-right font-mono">{num(r.km, 0)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.mediaPorViagem)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.receitaMensal)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.receitaAnual)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={2}>Total ({sorted.length} veículo(s))</TableCell>
                  <TableCell className="text-right font-mono">{totais.viagens}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.receita)}</TableCell>
                  <TableCell className="text-right font-mono text-brand">{brl(totais.recebido)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.pendente)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{brl(totais.atrasado)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.despesas)}</TableCell>
                  <TableCell className="text-right font-mono">{num(totais.km, 0)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
