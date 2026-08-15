import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Truck, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

function normalizarCategoria(c: string | null | undefined) {
  const s = (c ?? "").toLowerCase();
  if (s.includes("combust")) return "Combustível";
  if (s.includes("manut")) return "Manutenção";
  if (s.includes("pedág") || s.includes("pedag")) return "Pedágio";
  return "Outros";
}

export function RelatorioVeiculo() {
  const { role } = useAuth();
  const canSeeFinance = role === "administrador" || role === "financeiro";

  const hoje = new Date();
  const inicial = new Date();
  inicial.setDate(inicial.getDate() - 30);
  const [dataInicio, setDataInicio] = useState(inicial.toISOString().slice(0, 10));
  const [dataFim, setDataFim] = useState(hoje.toISOString().slice(0, 10));
  const [veiculoId, setVeiculoId] = useState<string>("all");

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-select"],
    queryFn: async () => {
      const { data } = await supabase.from("veiculos").select("id, placa, modelo").eq("ativo", true).order("placa");
      return (data ?? []) as { id: string; placa: string; modelo: string | null }[];
    },
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["relatorio-veiculo", veiculoId, dataInicio, dataFim],
    enabled: !!dataInicio && !!dataFim,
    queryFn: async () => {
      const filtroVeic = veiculoId === "all" ? null : veiculoId;

      // COMPETÊNCIA OPERACIONAL: data da viagem (data_saida), com fallback para created_at
      // apenas quando a viagem ainda não tem data de saída registrada.
      const viagQ = supabase
        .from("viagens")
        .select("id, codigo, status, data_saida, data_chegada, km_inicial, km_final, valor_frete, veiculo_id, motorista_id, origem_cidade, origem_uf, destino_cidade, destino_uf")
        .or(
          `and(data_saida.gte.${dataInicio},data_saida.lte.${dataFim}T23:59:59),and(data_saida.is.null,created_at.gte.${dataInicio},created_at.lte.${dataFim}T23:59:59)`,
        );
      if (filtroVeic) viagQ.eq("veiculo_id", filtroVeic);

      const abastQ = supabase
        .from("abastecimentos")
        .select("id, data, veiculo_id, litros, valor_total, km_percorridos, valor_litro, posto")
        .gte("data", dataInicio)
        .lte("data", dataFim);
      if (filtroVeic) abastQ.eq("veiculo_id", filtroVeic);

      // Despesas/receitas por COMPETÊNCIA (data_emissao = data do fato gerador),
      // e não por vencimento/pagamento.
      const lancQ = supabase
        .from("financeiro_lancamentos")
        .select("id, tipo, valor, status, data_emissao, data_vencimento, data_pagamento, categoria, descricao, veiculo_id")
        .gte("data_emissao", dataInicio)
        .lte("data_emissao", dataFim);
      if (filtroVeic) lancQ.eq("veiculo_id", filtroVeic);


      const [viag, abast, lanc, mot] = await Promise.all([
        viagQ,
        abastQ,
        lancQ,
        supabase.from("motoristas").select("id, nome"),
      ]);

      const motMap = new Map((mot.data ?? []).map((m: { id: string; nome: string }) => [m.id, m.nome]));

      return {
        viagens: (viag.data ?? []).map((v) => ({ ...v, motorista_nome: motMap.get(v.motorista_id ?? "") ?? "—" })),
        abastecimentos: abast.data ?? [],
        lancamentos: lanc.data ?? [],
      };
    },
  });

  const resumo = useMemo(() => {
    if (!data) return null;
    const kmViagens = data.viagens.reduce((s, v) => s + Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0)), 0);
    const litros = data.abastecimentos.reduce((s, a) => s + Number(a.litros ?? 0), 0);
    const kmAbast = data.abastecimentos.reduce((s, a) => s + Number(a.km_percorridos ?? 0), 0);
    const consumo = litros > 0 && kmAbast > 0 ? kmAbast / litros : 0;
    const gastoCombustivel = data.abastecimentos.reduce((s, a) => s + Number(a.valor_total ?? 0), 0);

    const despesas = { Combustível: 0, Manutenção: 0, Pedágio: 0, Outros: 0 } as Record<string, number>;
    let totalDespesas = 0;
    for (const l of data.lancamentos) {
      const val = Number(l.valor ?? 0);
      if (l.tipo !== "pagar") continue;
      const cat = normalizarCategoria(l.categoria);
      despesas[cat] += val;
      totalDespesas += val;
    }
    // Receita de frete pela COMPETÊNCIA da viagem (data da viagem), não pelo faturamento/recebimento.
    const receitaFrete = data.viagens
      .filter((v) => v.status !== "cancelada")
      .reduce((s, v) => s + Number(v.valor_frete ?? 0), 0)
      + data.lancamentos
        .filter((l) => l.tipo === "receber" && !l.viagem_id)
        .reduce((s, l) => s + Number(l.valor ?? 0), 0);

    const kmTotal = kmViagens > 0 ? kmViagens : kmAbast;
    const custoKm = kmTotal > 0 ? totalDespesas / kmTotal : 0;

    return {
      viagens: data.viagens.length,
      viagensConcluidas: data.viagens.filter((v) => v.status === "concluida").length,
      kmViagens,
      kmAbast,
      kmTotal,
      litros,
      consumo,
      gastoCombustivel,
      despesas,
      totalDespesas,
      receitaFrete,
      custoKm,
      resultado: receitaFrete - totalDespesas,
    };
  }, [data]);

  const veiculoLabel = useMemo(() => {
    if (veiculoId === "all") return "Todos os veículos";
    const v = veiculos.find((x) => x.id === veiculoId);
    return v ? `${v.placa}${v.modelo ? ` · ${v.modelo}` : ""}` : "—";
  }, [veiculoId, veiculos]);

  const exportPdf = () => {
    if (!data || !resumo) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const w = doc.internal.pageSize.getWidth();

    // Cabeçalho
    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, w, 60, "F");
    doc.setTextColor(241, 90, 36);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("G3 EXPRESSO", 40, 28);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text("Relatório de Viagens e Consumo por Veículo", 40, 46);

    let y = 90;
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(veiculoLabel, 40, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`Período: ${dataInicio} até ${dataFim}`, 40, y + 14);
    y += 40;

    // Resumo em cards
    const kpis: [string, string][] = [
      ["Viagens", `${resumo.viagensConcluidas}/${resumo.viagens}`],
      ["KM total", `${num(resumo.kmTotal, 0)} km`],
      ["Litros", `${num(resumo.litros, 1)} L`],
      ["Consumo", resumo.consumo > 0 ? `${resumo.consumo.toFixed(2)} km/L` : "—"],
      ...(canSeeFinance
        ? ([
            ["Combustível", brl(resumo.gastoCombustivel)],
            ["Manutenção", brl(resumo.despesas.Manutenção)],
            ["Pedágio", brl(resumo.despesas.Pedágio)],
            ["Outros", brl(resumo.despesas.Outros)],
            ["Receita frete", brl(resumo.receitaFrete)],
            ["Custo por km", brl(resumo.custoKm)],
            ["Resultado", brl(resumo.resultado)],
          ] as [string, string][])
        : []),
    ];
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: kpis,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [241, 90, 36], textColor: 255 },
      theme: "grid",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 20;

    // Viagens
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Viagens", 40, y);
    autoTable(doc, {
      startY: y + 8,
      head: [["OS", "Saída", "Chegada", "Origem", "Destino", "Motorista", "KM", ...(canSeeFinance ? ["Frete"] : [])]],
      body: data.viagens.map((v) => [
        v.codigo ?? "—",
        v.data_saida?.slice(0, 10) ?? "—",
        v.data_chegada?.slice(0, 10) ?? "—",
        `${v.origem_cidade ?? "—"}/${v.origem_uf ?? ""}`,
        `${v.destino_cidade ?? "—"}/${v.destino_uf ?? ""}`,
        v.motorista_nome ?? "—",
        num(Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0)), 0),
        ...(canSeeFinance ? [brl(Number(v.valor_frete ?? 0))] : []),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [20, 20, 20], textColor: 255 },
      theme: "striped",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 20;

    // Abastecimentos
    if (y > 700) {
      doc.addPage();
      y = 60;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Abastecimentos", 40, y);
    autoTable(doc, {
      startY: y + 8,
      head: [["Data", "Posto", "Litros", "R$/L", ...(canSeeFinance ? ["Total"] : []), "KM percorridos"]],
      body: data.abastecimentos.map((a) => [
        a.data ?? "—",
        a.posto ?? "—",
        num(Number(a.litros ?? 0), 1),
        brl(Number(a.valor_litro ?? 0)),
        ...(canSeeFinance ? [brl(Number(a.valor_total ?? 0))] : []),
        num(Number(a.km_percorridos ?? 0), 0),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [20, 20, 20], textColor: 255 },
      theme: "striped",
    });

    // Rodapé
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`G3 Expresso · Gerado em ${new Date().toLocaleString("pt-BR")} · Página ${i}/${pages}`, 40, doc.internal.pageSize.getHeight() - 20);
    }

    doc.save(`relatorio-veiculo-${veiculoId === "all" ? "todos" : veiculoLabel.split(" ")[0]}-${dataInicio}-${dataFim}.pdf`);
  };

  const exportExcel = () => {
    if (!data || !resumo) return;
    const wb = XLSX.utils.book_new();

    const resumoRows: (string | number)[][] = [
      ["Relatório de Viagens e Consumo"],
      ["Veículo", veiculoLabel],
      ["Período", `${dataInicio} a ${dataFim}`],
      [],
      ["Indicador", "Valor"],
      ["Viagens (concluídas/total)", `${resumo.viagensConcluidas}/${resumo.viagens}`],
      ["KM total", resumo.kmTotal],
      ["Litros abastecidos", resumo.litros],
      ["Consumo (km/L)", resumo.consumo],
    ];
    if (canSeeFinance) {
      resumoRows.push(
        ["Combustível (R$)", resumo.gastoCombustivel],
        ["Manutenção (R$)", resumo.despesas.Manutenção],
        ["Pedágio (R$)", resumo.despesas.Pedágio],
        ["Outros (R$)", resumo.despesas.Outros],
        ["Receita frete (R$)", resumo.receitaFrete],
        ["Custo por km (R$)", resumo.custoKm],
        ["Resultado (R$)", resumo.resultado],
      );
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoRows), "Resumo");

    const viagRows: (string | number)[][] = [
      ["OS", "Status", "Saída", "Chegada", "Origem", "Destino", "Motorista", "KM inicial", "KM final", "KM rodado", ...(canSeeFinance ? ["Frete"] : [])],
      ...data.viagens.map((v) => [
        v.codigo ?? "",
        v.status,
        v.data_saida ?? "",
        v.data_chegada ?? "",
        `${v.origem_cidade ?? ""}/${v.origem_uf ?? ""}`,
        `${v.destino_cidade ?? ""}/${v.destino_uf ?? ""}`,
        v.motorista_nome ?? "",
        Number(v.km_inicial ?? 0),
        Number(v.km_final ?? 0),
        Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0)),
        ...(canSeeFinance ? [Number(v.valor_frete ?? 0)] : []),
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(viagRows), "Viagens");

    const abastRows: (string | number)[][] = [
      ["Data", "Posto", "Litros", "R$/Litro", ...(canSeeFinance ? ["Total"] : []), "KM percorridos"],
      ...data.abastecimentos.map((a) => [
        a.data ?? "",
        a.posto ?? "",
        Number(a.litros ?? 0),
        Number(a.valor_litro ?? 0),
        ...(canSeeFinance ? [Number(a.valor_total ?? 0)] : []),
        Number(a.km_percorridos ?? 0),
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(abastRows), "Abastecimentos");

    if (canSeeFinance) {
      const lancRows: (string | number)[][] = [
        ["Tipo", "Categoria", "Descrição", "Valor", "Data do custo/receita", "Vencimento", "Pagamento", "Status"],
        ...data.lancamentos.map((l) => [
          l.tipo,
          l.categoria ?? "",
          l.descricao ?? "",
          Number(l.valor ?? 0),
          l.data_emissao ?? "",
          l.data_vencimento ?? "",
          l.data_pagamento ?? "",
          l.status,
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(lancRows), "Lançamentos");
    }

    XLSX.writeFile(wb, `relatorio-veiculo-${veiculoId === "all" ? "todos" : veiculoLabel.split(" ")[0]}-${dataInicio}-${dataFim}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <Truck className="size-4 text-brand" />
          <h2 className="font-display font-bold">Filtros do relatório</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="veic">Veículo</Label>
            <Select value={veiculoId} onValueChange={setVeiculoId}>
              <SelectTrigger id="veic"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os veículos</SelectItem>
                {veiculos.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.placa}{v.modelo ? ` · ${v.modelo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="di">Data inicial</Label>
            <Input id="di" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="df">Data final</Label>
            <Input id="df" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={exportPdf} disabled={!data || isLoading} className="flex-1">
              <FileText className="mr-2 size-4" /> PDF
            </Button>
            <Button onClick={exportExcel} disabled={!data || isLoading} variant="outline" className="flex-1">
              <FileSpreadsheet className="mr-2 size-4" /> Excel
            </Button>
          </div>
        </div>
      </Card>

      {isLoading || isFetching || !resumo ? (
        <div className="grid min-h-[30vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniKpi label="Viagens" value={`${resumo.viagensConcluidas}/${resumo.viagens}`} />
            <MiniKpi label="KM total" value={`${num(resumo.kmTotal, 0)} km`} />
            <MiniKpi label="Litros" value={`${num(resumo.litros, 1)} L`} />
            <MiniKpi label="Consumo" value={resumo.consumo > 0 ? `${resumo.consumo.toFixed(2)} km/L` : "—"} />
            {canSeeFinance && (
              <>
                <MiniKpi label="Combustível" value={brl(resumo.gastoCombustivel)} />
                <MiniKpi label="Manutenção" value={brl(resumo.despesas.Manutenção)} />
                <MiniKpi label="Receita frete" value={brl(resumo.receitaFrete)} tone="brand" />
                <MiniKpi label="Resultado" value={brl(resumo.resultado)} tone={resumo.resultado >= 0 ? "success" : "destructive"} />
              </>
            )}
          </div>

          <Card className="p-4 md:p-6">
            <h3 className="mb-3 font-display font-bold">Viagens do período</h3>
            {data && data.viagens.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma viagem no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Saída</TableHead>
                      <TableHead>Origem → Destino</TableHead>
                      <TableHead>Motorista</TableHead>
                      <TableHead className="text-right">KM</TableHead>
                      {canSeeFinance && <TableHead className="text-right">Frete</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.viagens.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono text-xs">{v.codigo ?? "—"}</TableCell>
                        <TableCell className="text-xs">{v.data_saida?.slice(0, 10) ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {v.origem_cidade}/{v.origem_uf} → {v.destino_cidade}/{v.destino_uf}
                        </TableCell>
                        <TableCell className="text-xs">{v.motorista_nome}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {num(Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0)), 0)}
                        </TableCell>
                        {canSeeFinance && (
                          <TableCell className="text-right tabular-nums">{brl(Number(v.valor_frete ?? 0))}</TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card className="p-4 md:p-6">
            <h3 className="mb-3 font-display font-bold">Abastecimentos</h3>
            {data && data.abastecimentos.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum abastecimento no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Posto</TableHead>
                      <TableHead className="text-right">Litros</TableHead>
                      <TableHead className="text-right">R$/L</TableHead>
                      {canSeeFinance && <TableHead className="text-right">Total</TableHead>}
                      <TableHead className="text-right">KM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.abastecimentos.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs">{a.data}</TableCell>
                        <TableCell className="text-xs">{a.posto ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(Number(a.litros ?? 0), 1)}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(Number(a.valor_litro ?? 0))}</TableCell>
                        {canSeeFinance && (
                          <TableCell className="text-right tabular-nums">{brl(Number(a.valor_total ?? 0))}</TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">{num(Number(a.km_percorridos ?? 0), 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          {canSeeFinance && (
            <Card className="p-4 md:p-6">
              <h3 className="mb-3 font-display font-bold">Custos e receitas vinculados à placa</h3>
              {data && data.lancamentos.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lançamento vinculado no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data do custo/receita</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.lancamentos.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs">{l.data_emissao ?? l.data_vencimento ?? l.data_pagamento ?? "—"}</TableCell>
                          <TableCell className="text-xs">{l.tipo === "pagar" ? "Despesa" : "Receita"}</TableCell>
                          <TableCell className="text-xs">{l.categoria ?? "—"}</TableCell>
                          <TableCell className="text-xs">{l.descricao ?? "—"}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{brl(Number(l.valor ?? 0))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: string; tone?: "brand" | "success" | "destructive" }) {
  const cls = tone === "brand" ? "text-brand" : tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </Card>
  );
}

// keep import used for iconography check
export const _icon = Download;
