import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortHead, useSort } from "@/components/ui/sortable";
import { KpiCard, SecaoVazia } from "@/components/relatorios/kpi-card";
import { FiltrosFinanceiros,
  selecionado,
  rotuloSelecao, filtrosIniciais, type FiltrosFin } from "@/components/relatorios/filtros-financeiros";
import { useBiDados, type ViagemBi } from "@/hooks/use-bi-dados";
import { brl, dt, exportarExcel, exportarPdf, pct } from "@/lib/export-utils";

export function RelatorioLucratividade() {
  const [filtros, setFiltros] = useState<FiltrosFin>(() => filtrosIniciais(90));
  const { data, isLoading, isFetching } = useBiDados(filtros.de, filtros.ate);

  const linhas = useMemo<ViagemBi[]>(() => {
    if (!data) return [];
    const q = filtros.busca.trim().toLowerCase();
    return data.viagens.filter((v) => {
      if (v.status === "cancelada") return false;
      if (!selecionado(filtros.clienteIds, v.cliente_id)) return false;
      if (!selecionado(filtros.veiculoIds, v.veiculo_id)) return false;
      if (!selecionado(filtros.motoristaIds, v.motorista_id)) return false;
      if (filtros.status === "pago" && v.recebido <= 0) return false;
      if (filtros.status === "atrasado" && v.atrasado <= 0) return false;
      if ((filtros.status === "pendente" || filtros.status === "a_vencer") && v.pendente <= 0) return false;
      if (!q) return true;
      return [v.codigo ?? "", v.cliente, v.motorista, v.placa, v.origem, v.destino]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, filtros]);

  const acc = {
    codigo: (v: ViagemBi) => v.codigo ?? "",
    data: (v: ViagemBi) => v.ref,
    cliente: (v: ViagemBi) => v.cliente,
    motorista: (v: ViagemBi) => v.motorista,
    veiculo: (v: ViagemBi) => v.placa,
    origem: (v: ViagemBi) => v.origem,
    destino: (v: ViagemBi) => v.destino,
    km: (v: ViagemBi) => v.km,
    frete: (v: ViagemBi) => v.valor_frete,
    receita: (v: ViagemBi) => v.receita,
    combustivel: (v: ViagemBi) => v.combustivel,
    pedagio: (v: ViagemBi) => v.pedagio,
    manutencao: (v: ViagemBi) => v.manutencao,
    outras: (v: ViagemBi) => v.outrasDespesas,
    despesas: (v: ViagemBi) => v.despesas,
    lucro: (v: ViagemBi) => v.lucro,
    margem: (v: ViagemBi) => v.margem,
  };
  const { sorted, sort, toggle } = useSort(linhas, acc, { key: "lucro", dir: "desc" });

  const resumo = useMemo(() => {
    const receita = linhas.reduce((s, v) => s + v.receita, 0);
    const despesas = linhas.reduce((s, v) => s + v.despesas, 0);
    const lucro = receita - despesas;
    const ordenadas = [...linhas].sort((a, b) => b.lucro - a.lucro);
    return {
      receita,
      despesas,
      lucro,
      lucroMedio: linhas.length ? lucro / linhas.length : 0,
      margemMedia: receita > 0 ? (lucro / receita) * 100 : 0,
      melhor: ordenadas[0],
      pior: ordenadas[ordenadas.length - 1],
      total: linhas.length,
    };
  }, [linhas]);

  const colunas = [
    "OS",
    "Data",
    "Cliente",
    "Motorista",
    "Veículo",
    "Origem",
    "Destino",
    "KM",
    "Frete",
    "Receita",
    "Combustível",
    "Pedágios",
    "Manutenções",
    "Outras despesas",
    "Despesas totais",
    "Lucro",
    "Margem %",
  ];
  const linha = (v: ViagemBi) => [
    v.codigo ?? "",
    v.ref,
    v.cliente,
    v.motorista,
    v.placa,
    v.origem,
    v.destino,
    v.km,
    v.valor_frete,
    v.receita,
    v.combustivel,
    v.pedagio,
    v.manutencao,
    v.outrasDespesas,
    v.despesas,
    v.lucro,
    Number(v.margem.toFixed(1)),
  ];

  return (
    <div className="space-y-4">
      <FiltrosFinanceiros
        value={filtros}
        onChange={setFiltros}
        dados={data}
        mostrar={["periodo", "empresa", "cliente", "veiculo", "motorista", "status", "busca"]}
        buscaPlaceholder="OS, cliente, placa, cidade…"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Receita total" value={brl(resumo.receita)} tone="brand" icon={TrendingUp} />
        <KpiCard label="Despesas totais" value={brl(resumo.despesas)} tone="danger" />
        <KpiCard label="Lucro total" value={brl(resumo.lucro)} tone={resumo.lucro >= 0 ? "success" : "danger"} />
        <KpiCard label="Lucro médio / viagem" value={brl(resumo.lucroMedio)} sub={`${resumo.total} viagem(ns)`} />
        <KpiCard label="Margem média" value={pct(resumo.margemMedia)} tone={resumo.margemMedia >= 0 ? "success" : "danger"} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Viagem mais lucrativa</div>
          {resumo.melhor ? (
            <>
              <div className="mt-1 font-display font-bold text-brand">{brl(resumo.melhor.lucro)}</div>
              <div className="text-xs text-muted-foreground">
                OS {resumo.melhor.codigo ?? "—"} · {resumo.melhor.cliente} · {resumo.melhor.rota} · margem{" "}
                {pct(resumo.melhor.margem)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">—</div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Viagem menos lucrativa</div>
          {resumo.pior ? (
            <>
              <div className="mt-1 font-display font-bold text-destructive">{brl(resumo.pior.lucro)}</div>
              <div className="text-xs text-muted-foreground">
                OS {resumo.pior.codigo ?? "—"} · {resumo.pior.cliente} · {resumo.pior.rota} · margem {pct(resumo.pior.margem)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">—</div>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportarExcel(`lucratividade-viagens-${filtros.de}_${filtros.ate}.xlsx`, [
              { nome: "Lucratividade", colunas, linhas: sorted.map(linha) },
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
              nomeArquivo: `lucratividade-viagens-${filtros.de}_${filtros.ate}.pdf`,
              titulo: "Relatório de lucratividade por viagem",
              subtitulo: "G3 Expresso",
              filtros: [`Período ${dt(filtros.de)} a ${dt(filtros.ate)}`, `${resumo.total} viagem(ns)`],
              kpis: [
                ["Receita total", brl(resumo.receita)],
                ["Despesas totais", brl(resumo.despesas)],
                ["Lucro total", brl(resumo.lucro)],
                ["Lucro médio", brl(resumo.lucroMedio)],
                ["Margem média", pct(resumo.margemMedia)],
              ],
              secoes: [
                {
                  colunas,
                  linhas: sorted.map((v) => [
                    v.codigo ?? "",
                    dt(v.ref),
                    v.cliente,
                    v.motorista,
                    v.placa,
                    v.origem,
                    v.destino,
                    v.km,
                    brl(v.valor_frete),
                    brl(v.receita),
                    brl(v.combustivel),
                    brl(v.pedagio),
                    brl(v.manutencao),
                    brl(v.outrasDespesas),
                    brl(v.despesas),
                    brl(v.lucro),
                    pct(v.margem),
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
                  <SortHead sortKey="codigo" sort={sort} onToggle={toggle}>OS</SortHead>
                  <SortHead sortKey="data" sort={sort} onToggle={toggle}>Data</SortHead>
                  <SortHead sortKey="cliente" sort={sort} onToggle={toggle}>Cliente</SortHead>
                  <SortHead sortKey="motorista" sort={sort} onToggle={toggle}>Motorista</SortHead>
                  <SortHead sortKey="veiculo" sort={sort} onToggle={toggle}>Veículo</SortHead>
                  <SortHead sortKey="origem" sort={sort} onToggle={toggle}>Origem</SortHead>
                  <SortHead sortKey="destino" sort={sort} onToggle={toggle}>Destino</SortHead>
                  <SortHead sortKey="km" sort={sort} onToggle={toggle} align="right">KM</SortHead>
                  <SortHead sortKey="frete" sort={sort} onToggle={toggle} align="right">Frete</SortHead>
                  <SortHead sortKey="combustivel" sort={sort} onToggle={toggle} align="right">Combustível</SortHead>
                  <SortHead sortKey="pedagio" sort={sort} onToggle={toggle} align="right">Pedágios</SortHead>
                  <SortHead sortKey="manutencao" sort={sort} onToggle={toggle} align="right">Manutenções</SortHead>
                  <SortHead sortKey="outras" sort={sort} onToggle={toggle} align="right">Outras</SortHead>
                  <SortHead sortKey="despesas" sort={sort} onToggle={toggle} align="right">Despesas</SortHead>
                  <SortHead sortKey="receita" sort={sort} onToggle={toggle} align="right">Receita líquida</SortHead>
                  <SortHead sortKey="lucro" sort={sort} onToggle={toggle} align="right">Lucro</SortHead>
                  <SortHead sortKey="margem" sort={sort} onToggle={toggle} align="right">Margem</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.codigo ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{dt(v.ref)}</TableCell>
                    <TableCell className="text-sm">{v.cliente}</TableCell>
                    <TableCell className="text-xs">{v.motorista}</TableCell>
                    <TableCell className="font-mono text-xs">{v.placa}</TableCell>
                    <TableCell className="text-xs">{v.origem}</TableCell>
                    <TableCell className="text-xs">{v.destino}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{v.km.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(v.valor_frete)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(v.combustivel)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(v.pedagio)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(v.manutencao)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(v.outrasDespesas)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-destructive">{brl(v.despesas)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{brl(v.receita)}</TableCell>
                    <TableCell
                      className={`text-right font-mono text-xs font-semibold ${v.lucro >= 0 ? "text-brand" : "text-destructive"}`}
                    >
                      {brl(v.lucro)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={v.margem >= 0 ? "default" : "destructive"}>{pct(v.margem)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={13}>Total ({sorted.length} viagem(ns))</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{brl(resumo.despesas)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(resumo.receita)}</TableCell>
                  <TableCell className={`text-right font-mono ${resumo.lucro >= 0 ? "text-brand" : "text-destructive"}`}>
                    {brl(resumo.lucro)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{pct(resumo.margemMedia)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
