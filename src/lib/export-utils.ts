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

export type PdfImagem = { titulo?: string; dataUrl: string };

/** Converte um elemento da tela (ex.: gráfico) em PNG para embutir no PDF/relatório. */
export async function capturarElemento(el: HTMLElement | null | undefined): Promise<string | null> {
  if (!el) return null;
  try {
    const { toPng } = await import("html-to-image");
    return await toPng(el, {
      pixelRatio: 2,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      filter: (node) => !(node instanceof HTMLElement && node.dataset.exportIgnore === "true"),
    });
  } catch {
    return null;
  }
}

/** Exporta um relatório em PDF (A4 paisagem) respeitando os filtros aplicados */
export function exportarPdf(opts: {
  nomeArquivo: string;
  titulo: string;
  subtitulo?: string;
  filtros?: string[];
  kpis?: [string, string][];
  imagens?: PdfImagem[];
  secoes: PdfSecao[];
  orientacao?: "portrait" | "landscape";
  /** Linhas de assinatura no final (ex.: ["G3 Expresso", "Motorista"]) */
  assinaturas?: string[];
  /** Abre a impressão em vez de baixar */
  imprimir?: boolean;
}) {
  const doc = new jsPDF({ orientation: opts.orientacao ?? "landscape", unit: "mm", format: "a4" });
  const alturaPagina = doc.internal.pageSize.getHeight();
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

  for (const img of opts.imagens ?? []) {
    const props = doc.getImageProperties(img.dataUrl);
    const larguraImg = largura - 28;
    const alturaImg = (props.height / props.width) * larguraImg;
    if (y + alturaImg + 12 > alturaPagina) {
      doc.addPage();
      y = 15;
    }
    if (img.titulo) {
      doc.setFontSize(10);
      doc.text(img.titulo, 14, y + 4);
      y += 7;
    }
    doc.addImage(img.dataUrl, "PNG", 14, y, larguraImg, alturaImg);
    y += alturaImg + 8;
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

  if (opts.assinaturas?.length) {
    if (y + 30 > alturaPagina) {
      doc.addPage();
      y = 20;
    }
    y += 18;
    const n = opts.assinaturas.length;
    const w = (largura - 28 - (n - 1) * 12) / n;
    opts.assinaturas.forEach((a, i) => {
      const x = 14 + i * (w + 12);
      doc.line(x, y, x + w, y);
      doc.setFontSize(8);
      doc.text(a, x + w / 2, y + 4, { align: "center" });
    });
    doc.text(`Data: ____/____/______`, 14, y + 14);
  }

  const nome = opts.nomeArquivo.endsWith(".pdf") ? opts.nomeArquivo : `${opts.nomeArquivo}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  if (opts.imprimir) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    iframe.src = url;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.location.href = url;
      }
    };
    document.body.appendChild(iframe);
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 120_000);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
