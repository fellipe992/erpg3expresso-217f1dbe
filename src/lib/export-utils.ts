import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type Celula = string | number | null | undefined;

export const brl = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const num = (n: number, d = 2) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { maximumFractionDigits: d });

export const pct = (n: number, d = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(d)}%`;

export const dt = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—";

export type Planilha = {
  nome: string;
  colunas: string[];
  linhas: Celula[][];
};

/** Exporta uma ou mais abas para um arquivo .xlsx */
export function exportarExcel(nomeArquivo: string, planilhas: Planilha[]) {
  const wb = XLSX.utils.book_new();
  for (const p of planilhas) {
    const ws = XLSX.utils.aoa_to_sheet([p.colunas, ...p.linhas.map((l) => l.map((c) => c ?? ""))]);
    const larguras = p.colunas.map((c, i) => {
      const max = Math.max(
        c.length,
        ...p.linhas.slice(0, 300).map((l) => String(l[i] ?? "").length),
      );
      return { wch: Math.min(40, Math.max(10, max + 2)) };
    });
    (ws as unknown as { ["!cols"]: unknown })["!cols"] = larguras;
    XLSX.utils.book_append_sheet(wb, ws, p.nome.slice(0, 31));
  }
  XLSX.writeFile(wb, nomeArquivo.endsWith(".xlsx") ? nomeArquivo : `${nomeArquivo}.xlsx`);
}

export type PdfSecao = {
  titulo?: string;
  colunas: string[];
  linhas: Celula[][];
};

/** Exporta um relatório em PDF (A4 paisagem) respeitando os filtros aplicados */
export function exportarPdf(opts: {
  nomeArquivo: string;
  titulo: string;
  subtitulo?: string;
  filtros?: string[];
  kpis?: [string, string][];
  secoes: PdfSecao[];
  orientacao?: "portrait" | "landscape";
}) {
  const doc = new jsPDF({ orientation: opts.orientacao ?? "landscape", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFontSize(15);
  doc.text(opts.titulo, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  if (opts.subtitulo) doc.text(opts.subtitulo, 14, 21);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")}`, largura - 14, 15, { align: "right" });
  doc.setTextColor(0);

  let y = 26;
  if (opts.filtros?.length) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Filtros: ${opts.filtros.join("  •  ")}`, 14, y);
    doc.setTextColor(0);
    y += 5;
  }

  if (opts.kpis?.length) {
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: opts.kpis,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.6 },
      headStyles: { fillColor: [241, 90, 36], textColor: 255 },
      tableWidth: 110,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  for (const s of opts.secoes) {
    if (s.titulo) {
      doc.setFontSize(10);
      doc.text(s.titulo, 14, y);
      y += 2;
    }
    autoTable(doc, {
      startY: y + 2,
      head: [s.colunas],
      body: s.linhas.map((l) => l.map((c) => (c == null ? "" : String(c)))),
      theme: "striped",
      styles: { fontSize: 7.2, cellPadding: 1.4, overflow: "linebreak" },
      headStyles: { fillColor: [20, 20, 20], textColor: 255, fontSize: 7.4 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  doc.save(opts.nomeArquivo.endsWith(".pdf") ? opts.nomeArquivo : `${opts.nomeArquivo}.pdf`);
}
