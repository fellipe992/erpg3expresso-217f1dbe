import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { carregarDetalheFechamento, type DetalheFechamento } from "@/lib/fechamento";
import { brl, dt, exportarExcel, exportarPdf, type Celula } from "@/lib/export-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** No relatório do motorista nenhuma informação do cliente é exibida. */
const colunasDe = (tipo: string) => [
  "OS",
  "Data",
  ...(tipo === "cliente" ? ["Cliente"] : []),
  "Motorista",
  "Placa",
  "Tipologia",
  "Origem",
  "Destino",
  "Raio",
  "Frete",
  "Pedágio",
  "Adicionais",
  "Descontos",
  "Total",
];

const linhasDe = (d: DetalheFechamento): Celula[][] =>
  d.linhas.map((l) => [
    l.codigo ?? "—",
    dt(l.data),
    ...(d.fechamento.tipo === "cliente" ? [l.cliente] : []),
    l.motorista,
    l.placa,
    l.tipologia,
    l.origem,
    l.destino,
    l.raio,
    brl(l.frete),
    brl(l.pedagio),
    brl(l.adicionais),
    brl(l.descontos),
    brl(l.total),
  ]);

/** Somente os ajustes com valor no lado do fechamento (motorista nunca vê valores do cliente). */
const ajustesDe = (d: DetalheFechamento): Celula[][] =>
  d.linhas.flatMap((l) =>
    l.ajustes
      .map((a) => ({
        a,
        valor: d.fechamento.tipo === "cliente" ? a.valor_cliente : a.valor_motorista,
      }))
      .filter((x) => x.valor > 0)
      .map(
        (x) =>
          [
            l.codigo ?? "—",
            x.a.tipo === "desconto" ? "Desconto" : "Adicional",
            x.a.descricao,
            brl(x.valor),
          ] as Celula[],
      ),
  );

const tituloDe = (d: DetalheFechamento) =>
  `Fechamento #${d.fechamento.numero} — ${d.fechamento.tipo === "cliente" ? "Cliente" : "Motorista"}`;

const subtituloDe = (d: DetalheFechamento) =>
  `${d.fechamento.cliente?.razao_social ?? d.fechamento.motorista?.nome ?? ""} • Período ${dt(
    d.fechamento.periodo_inicio,
  )} a ${dt(d.fechamento.periodo_fim)} • ${d.linhas.length} viagem(ns)`;

export function baixarPdfFechamento(d: DetalheFechamento) {
  exportarPdf({
    nomeArquivo: `fechamento-${d.fechamento.numero}`,
    titulo: tituloDe(d),
    subtitulo: subtituloDe(d),
    kpis: [
      ["Total das viagens", brl(d.fechamento.valor_viagens)],
      ["Descontos extras", brl(d.fechamento.valor_descontos_extras)],
      ["Valor final", brl(d.fechamento.valor)],
      ["Vencimento", dt(d.fechamento.vencimento)],
      ["Status", d.fechamento.status],
    ],
    secoes: [
      { titulo: "Viagens do fechamento", colunas: colunasDe(d.fechamento.tipo), linhas: linhasDe(d) },
      ...(ajustesDe(d).length
        ? [
            {
              titulo: "Descontos e adicionais das viagens",
              colunas: ["OS", "Tipo", "Descrição", "Valor"],
              linhas: ajustesDe(d),
            },
          ]
        : []),
      ...(d.extras.length
        ? [
            {
              titulo: "Descontos / acertos do fechamento",
              colunas: ["Descrição", "Valor"],
              linhas: d.extras.map((e) => [e.descricao, brl(e.valor)] as Celula[]),
            },
          ]
        : []),
    ],
  });
}

export function baixarExcelFechamento(d: DetalheFechamento) {
  exportarExcel(`fechamento-${d.fechamento.numero}`, [
    { nome: "Viagens", colunas: colunasDe(d.fechamento.tipo), linhas: linhasDe(d) },
    ...(ajustesDe(d).length
      ? [
          {
            nome: "Ajustes",
            colunas: ["OS", "Tipo", "Descrição", "Valor"],
            linhas: ajustesDe(d),
          },
        ]
      : []),
    {
      nome: "Resumo",
      colunas: ["Indicador", "Valor"],
      linhas: [
        ["Fechamento", `#${d.fechamento.numero}`],
        ["Tipo", d.fechamento.tipo],
        ["Beneficiário", d.fechamento.cliente?.razao_social ?? d.fechamento.motorista?.nome ?? "—"],
        ["Período", `${dt(d.fechamento.periodo_inicio)} a ${dt(d.fechamento.periodo_fim)}`],
        ["Total das viagens", brl(d.fechamento.valor_viagens)],
        ["Descontos extras", brl(d.fechamento.valor_descontos_extras)],
        ["Valor final", brl(d.fechamento.valor)],
        ["Vencimento", dt(d.fechamento.vencimento)],
        ["Status", d.fechamento.status],
      ],
    },
    ...(d.extras.length
      ? [
          {
            nome: "Descontos",
            colunas: ["Descrição", "Valor"],
            linhas: d.extras.map((e) => [e.descricao, brl(e.valor)] as Celula[]),
          },
        ]
      : []),
  ]);
}

/** Modal de detalhe do fechamento com exportação em PDF e Excel. */
export function RelatorioFechamentoDialog({
  fechamentoId,
  open,
  onOpenChange,
}: {
  fechamentoId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["fechamento-detalhe", fechamentoId],
    enabled: !!fechamentoId && open,
    queryFn: () => carregarDetalheFechamento(fechamentoId!),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data ? tituloDe(data) : "Fechamento"}</DialogTitle>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="grid place-items-center p-10">
            <Loader2 className="size-5 animate-spin text-brand" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{subtituloDe(data)}</p>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[900px] text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-left">
                    {colunasDe(data.fechamento.tipo).map((c) => (
                      <th key={c} className="px-2 py-2 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasDe(data).map((l, i) => (
                    <tr key={i} className="border-b border-border/40 last:border-0">
                      {l.map((c, j) => (
                        <td
                          key={j}
                          className={
                            j >= colunasDe(data.fechamento.tipo).indexOf("Frete")
                              ? "px-2 py-1.5 font-mono tabular-nums"
                              : "px-2 py-1.5"
                          }
                        >
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Resumo label="Total das viagens" valor={brl(data.fechamento.valor_viagens)} />
              <Resumo label="Descontos extras" valor={brl(data.fechamento.valor_descontos_extras)} />
              <Resumo label="Valor final" valor={brl(data.fechamento.valor)} destaque />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => data && baixarExcelFechamento(data)} disabled={!data}>
            <FileSpreadsheet className="mr-2 size-4" /> Excel
          </Button>
          <Button onClick={() => data && baixarPdfFechamento(data)} disabled={!data}>
            <FileText className="mr-2 size-4" /> PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Resumo({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border border-border/60 p-3 ${destaque ? "bg-brand-subtle/40" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

/** Botão reutilizável para abrir o relatório de um fechamento. */
export function BotaoRelatorioFechamento({
  fechamentoId,
  children,
}: {
  fechamentoId: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileText className="mr-1 size-4" /> {children ?? "Fechamento"}
      </Button>
      <RelatorioFechamentoDialog fechamentoId={fechamentoId} open={open} onOpenChange={setOpen} />
    </>
  );
}
