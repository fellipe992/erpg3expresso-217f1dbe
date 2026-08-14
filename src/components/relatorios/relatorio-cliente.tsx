import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortHead, useSort } from "@/components/ui/sortable";
import { KpiCard, SecaoVazia } from "@/components/relatorios/kpi-card";
import {
  FiltrosFinanceiros,
  filtrosIniciais,
  statusCombina,
  type FiltrosFin,
} from "@/components/relatorios/filtros-financeiros";
import { useBiDados, rotuloMes } from "@/hooks/use-bi-dados";
import { brl, dt, exportarExcel, exportarPdf, num } from "@/lib/export-utils";

type LinhaCliente = {
  clienteId: string;
  cliente: string;
  faturado: number;
  recebido: number;
  pendente: number;
  atrasado: number;
  /** Custos da operação: despesas das viagens + despesas rateadas ao cliente */
  despesas: number;
  resultado: number;
  margem: number;
  viagens: number;
  ticketMedio: number;
  freteMedio: number;
  receitaMensal: number;
  receitaAnual: number;
};


export function RelatorioCliente() {
  const [filtros, setFiltros] = useState<FiltrosFin>(() => filtrosIniciais(90));
  const { data, isLoading, isFetching } = useBiDados(filtros.de, filtros.ate);

  const meses = useMemo(() => {
    const a = new Date(`${filtros.de}T00:00:00`);
    const b = new Date(`${filtros.ate}T00:00:00`);
    const n = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
    return Math.max(1, n);
  }, [filtros.de, filtros.ate]);

  const linhas = useMemo<LinhaCliente[]>(() => {
    if (!data) return [];
    const q = filtros.busca.trim().toLowerCase();
    const map = new Map<string, LinhaCliente>();

    const get = (id: string, nome: string): LinhaCliente => {
      let l = map.get(id);
      if (!l) {
        l = {
          clienteId: id,
          cliente: nome,
          faturado: 0,
          recebido: 0,
          pendente: 0,
          atrasado: 0,
          despesas: 0,
          resultado: 0,
          margem: 0,
          viagens: 0,
          ticketMedio: 0,
          freteMedio: 0,
          receitaMensal: 0,
          receitaAnual: 0,
        };
        map.set(id, l);
      }
      return l;
    };


    for (const l of data.lancamentos) {
      if (l.tipo !== "receber" || !l.cliente_id) continue;
      if (filtros.clienteId !== "todos" && l.cliente_id !== filtros.clienteId) continue;
      if (!statusCombina(l, filtros.status)) continue;
      const ref = l.competencia;
      if (ref && (ref < filtros.de || ref > filtros.ate)) continue;

      const nome = data.nomeCliente(l.cliente_id);
      if (q && !nome.toLowerCase().includes(q) && !(l.numero_documento ?? "").toLowerCase().includes(q)) continue;
      const row = get(l.cliente_id, nome);
      row.faturado += l.valor;
      if (l.status === "pago") row.recebido += l.valor;
      else if (l.status === "atrasado") row.atrasado += l.valor;
      else row.pendente += l.valor;
    }

    const fretes = new Map<string, number[]>();
    for (const v of data.viagens) {
      if (!v.cliente_id || v.status === "cancelada") continue;
      if (filtros.clienteId !== "todos" && v.cliente_id !== filtros.clienteId) continue;
      if (q && !v.cliente.toLowerCase().includes(q) && !(v.codigo ?? "").toLowerCase().includes(q)) continue;
      if (filtros.status !== "todos" && !map.has(v.cliente_id)) continue;
      const row = get(v.cliente_id, v.cliente);
      row.viagens += 1;
      row.despesas += v.despesas;
      const arr = fretes.get(v.cliente_id) ?? [];
      arr.push(v.valor_frete);
      fretes.set(v.cliente_id, arr);
    }

    // Despesas rateadas diretamente ao cliente (frete de terceiro, ajudante, taxas…)
    // sem viagem vinculada — evita dupla contagem das despesas já somadas por viagem.
    for (const l of data.lancamentos) {
      if (l.tipo !== "pagar" || !l.cliente_id || l.viagem_id) continue;
      if (filtros.clienteId !== "todos" && l.cliente_id !== filtros.clienteId) continue;
      const nome = data.nomeCliente(l.cliente_id);
      if (q && !nome.toLowerCase().includes(q)) continue;
      get(l.cliente_id, nome).despesas += l.valor;
    }

    return Array.from(map.values())
      .map((r) => {
        const f = fretes.get(r.clienteId) ?? [];
        const resultado = r.faturado - r.despesas;
        return {
          ...r,
          resultado,
          margem: r.faturado > 0 ? (resultado / r.faturado) * 100 : 0,
          ticketMedio: r.viagens > 0 ? r.faturado / r.viagens : 0,
          freteMedio: f.length ? f.reduce((s, x) => s + x, 0) / f.length : 0,
          receitaMensal: r.faturado / meses,
          receitaAnual: (r.faturado / meses) * 12,
        };
      })
      .filter((r) => r.faturado > 0 || r.viagens > 0 || r.despesas > 0)
      .sort((a, b) => b.faturado - a.faturado);

  }, [data, filtros, meses]);

  const acc = {
    cliente: (r: LinhaCliente) => r.cliente,
    viagens: (r: LinhaCliente) => r.viagens,
    faturado: (r: LinhaCliente) => r.faturado,
    recebido: (r: LinhaCliente) => r.recebido,
    pendente: (r: LinhaCliente) => r.pendente,
    atrasado: (r: LinhaCliente) => r.atrasado,
    despesas: (r: LinhaCliente) => r.despesas,
    resultado: (r: LinhaCliente) => r.resultado,
    margem: (r: LinhaCliente) => r.margem,
    ticket: (r: LinhaCliente) => r.ticketMedio,
    frete: (r: LinhaCliente) => r.freteMedio,
    mensal: (r: LinhaCliente) => r.receitaMensal,
    anual: (r: LinhaCliente) => r.receitaAnual,
  };
  const { sorted, sort, toggle } = useSort(linhas, acc, { key: "faturado", dir: "desc" });

  const totais = useMemo(
    () =>
      linhas.reduce(
        (a, r) => ({
          faturado: a.faturado + r.faturado,
          recebido: a.recebido + r.recebido,
          pendente: a.pendente + r.pendente,
          atrasado: a.atrasado + r.atrasado,
          despesas: a.despesas + r.despesas,
          resultado: a.resultado + r.resultado,
          viagens: a.viagens + r.viagens,
        }),
        { faturado: 0, recebido: 0, pendente: 0, atrasado: 0, despesas: 0, resultado: 0, viagens: 0 },
      ),
    [linhas],
  );


  const serieMensal = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { mes: string; faturado: number; recebido: number }>();
    for (const l of data.lancamentos) {
      if (l.tipo !== "receber" || !l.cliente_id) continue;
      if (filtros.clienteId !== "todos" && l.cliente_id !== filtros.clienteId) continue;
      if (!statusCombina(l, filtros.status)) continue;
      const ref = l.competencia.slice(0, 7);
      if (!ref) continue;
      const b = map.get(ref) ?? { mes: rotuloMes(ref), faturado: 0, recebido: 0 };
      b.faturado += l.valor;
      if (l.status === "pago") b.recebido += l.valor;
      map.set(ref, b);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }, [data, filtros]);

  const colunas = [
    "Cliente",
    "Viagens",
    "Faturado",
    "Recebido",
    "Pendente",
    "Em atraso",
    "Despesas da operação",
    "Resultado",
    "Margem %",
    "Ticket médio",
    "Frete médio",
    "Receita mensal",
    "Receita anual",
  ];
  const linhasExport = () =>
    sorted.map((r) => [
      r.cliente,
      r.viagens,
      r.faturado,
      r.recebido,
      r.pendente,
      r.atrasado,
      r.despesas,
      r.resultado,
      r.margem,
      r.ticketMedio,
      r.freteMedio,
      r.receitaMensal,
      r.receitaAnual,
    ]);

  const descricaoFiltros = [
    `Período ${dt(filtros.de)} a ${dt(filtros.ate)}`,
    `Cliente: ${filtros.clienteId === "todos" ? "Todos" : data?.nomeCliente(filtros.clienteId) ?? "—"}`,
    `Status: ${filtros.status}`,
  ];

  return (
    <div className="space-y-4">
      <FiltrosFinanceiros
        value={filtros}
        onChange={setFiltros}
        dados={data}
        mostrar={["periodo", "empresa", "cliente", "status", "busca"]}
        buscaPlaceholder="Cliente ou nota fiscal…"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total faturado" value={brl(totais.faturado)} tone="brand" icon={Users} />
        <KpiCard label="Recebido" value={brl(totais.recebido)} tone="success" />
        <KpiCard label="Pendente" value={brl(totais.pendente)} />
        <KpiCard label="Em atraso" value={brl(totais.atrasado)} tone="danger" />
        <KpiCard
          label="Viagens / ticket médio"
          value={String(totais.viagens)}
          sub={totais.viagens ? `${brl(totais.faturado / totais.viagens)} por viagem` : undefined}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportarExcel(`financeiro-por-cliente-${filtros.de}_${filtros.ate}.xlsx`, [
              { nome: "Por cliente", colunas, linhas: linhasExport() },
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
              nomeArquivo: `financeiro-por-cliente-${filtros.de}_${filtros.ate}.pdf`,
              titulo: "Relatório financeiro por cliente",
              subtitulo: "G3 Expresso",
              filtros: descricaoFiltros,
              kpis: [
                ["Total faturado", brl(totais.faturado)],
                ["Recebido", brl(totais.recebido)],
                ["Pendente", brl(totais.pendente)],
                ["Em atraso", brl(totais.atrasado)],
                ["Viagens", String(totais.viagens)],
              ],
              secoes: [
                {
                  colunas,
                  linhas: sorted.map((r) => [
                    r.cliente,
                    r.viagens,
                    brl(r.faturado),
                    brl(r.recebido),
                    brl(r.pendente),
                    brl(r.atrasado),
                    brl(r.ticketMedio),
                    brl(r.freteMedio),
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
        <h3 className="mb-4 font-display font-bold">Receita por mês</h3>
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
                <Bar dataKey="faturado" name="Faturado" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recebido" name="Recebido" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
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
                  <SortHead sortKey="cliente" sort={sort} onToggle={toggle}>Cliente</SortHead>
                  <SortHead sortKey="viagens" sort={sort} onToggle={toggle} align="right">Viagens</SortHead>
                  <SortHead sortKey="faturado" sort={sort} onToggle={toggle} align="right">Faturado</SortHead>
                  <SortHead sortKey="recebido" sort={sort} onToggle={toggle} align="right">Recebido</SortHead>
                  <SortHead sortKey="pendente" sort={sort} onToggle={toggle} align="right">Pendente</SortHead>
                  <SortHead sortKey="atrasado" sort={sort} onToggle={toggle} align="right">Em atraso</SortHead>
                  <SortHead sortKey="ticket" sort={sort} onToggle={toggle} align="right">Ticket médio</SortHead>
                  <SortHead sortKey="frete" sort={sort} onToggle={toggle} align="right">Frete médio</SortHead>
                  <SortHead sortKey="mensal" sort={sort} onToggle={toggle} align="right">Receita mensal</SortHead>
                  <SortHead sortKey="anual" sort={sort} onToggle={toggle} align="right">Receita anual</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow key={r.clienteId}>
                    <TableCell className="font-medium">{r.cliente}</TableCell>
                    <TableCell className="text-right font-mono">{r.viagens}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{brl(r.faturado)}</TableCell>
                    <TableCell className="text-right font-mono text-brand">{brl(r.recebido)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.pendente)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{brl(r.atrasado)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.ticketMedio)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.freteMedio)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.receitaMensal)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.receitaAnual)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total ({sorted.length} cliente(s))</TableCell>
                  <TableCell className="text-right font-mono">{num(totais.viagens, 0)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.faturado)}</TableCell>
                  <TableCell className="text-right font-mono text-brand">{brl(totais.recebido)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.pendente)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{brl(totais.atrasado)}</TableCell>
                  <TableCell colSpan={4} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
