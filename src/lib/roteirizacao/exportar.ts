import * as XLSX from "xlsx";

import { brl, duracao } from "./format";
import { kg, minutosParaHora } from "./parse";
import type { Plano } from "./plano";
import { totaisPlano } from "./plano";

function baixar(wb: XLSX.WorkBook, nome: string) {
  XLSX.writeFile(wb, `${nome}.xlsx`);
}

const arquivo = (nome: string) =>
  `${nome.replace(/[^\w-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;

/** Planilha de sequência de entregas por rota (roteiro do motorista). */
export function exportarSequencia(plano: Plano, nomeProjeto: string) {
  const linhas = plano.rotas.flatMap((r) =>
    r.paradas.map((p) => ({
      Rota: r.rotulo ?? r.veiculo.nome,
      Veículo: r.veiculo.nome,
      CD: r.deposito?.nome ?? "",
      Sequência: p.ordem,
      NF: p.entrega.nf ?? "",
      Cliente: p.entrega.cliente ?? "",
      Endereço: p.entrega.endereco,
      Região: p.entrega.regiao ?? "",
      "Peso (kg)": p.entrega.pesoKg,
      "Descarga (min)": p.entrega.tempoDescargaMin,
      "Janela até": p.entrega.horarioEntrega ?? "",
      "Chegada prevista": minutosParaHora(p.chegadaMin),
      "Saída prevista": minutosParaHora(p.saidaMin),
      "KM acumulado": Number(p.kmAcumulado.toFixed(1)),
      Situação: p.atrasada ? "Fora da janela" : "No prazo",
      Observações: p.entrega.observacoes ?? "",
    })),
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Sequência");
  baixar(wb, arquivo(`${nomeProjeto}-sequencia`));
}

/** Mapa de carregamento: ordem inversa de entrega (último a entrar, primeiro a sair). */
export function exportarCarregamento(plano: Plano, nomeProjeto: string) {
  const wb = XLSX.utils.book_new();
  plano.rotas.forEach((r) => {
    const linhas = [...r.paradas]
      .sort((a, b) => b.ordem - a.ordem)
      .map((p, i) => ({
        "Ordem de carga": i + 1,
        "Entrega nº": p.ordem,
        NF: p.entrega.nf ?? "",
        Cliente: p.entrega.cliente ?? "",
        Endereço: p.entrega.endereco,
        "Peso (kg)": p.entrega.pesoKg,
        Observações: p.entrega.observacoes ?? "",
      }));
    const nome = (r.rotulo ?? r.veiculo.nome).slice(0, 28);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), nome);
  });
  baixar(wb, arquivo(`${nomeProjeto}-carregamento`));
}

/** Resumo gerencial do plano (uma linha por rota + totais). */
export function exportarResumo(plano: Plano, nomeProjeto: string) {
  const linhas = plano.rotas.map((r) => ({
    Rota: r.rotulo ?? r.veiculo.nome,
    Veículo: r.veiculo.nome,
    CD: r.deposito?.nome ?? "",
    Entregas: r.paradas.length,
    "Peso (kg)": Number(r.pesoKg.toFixed(3)),
    "Ocupação (%)": Number((r.ocupacaoPeso * 100).toFixed(1)),
    KM: Number(r.km.toFixed(1)),
    Duração: duracao(r.minutos),
    "Custo (R$)": Number(r.custo.total.toFixed(2)),
    "Custo por entrega (R$)": Number((r.custo.total / Math.max(1, r.paradas.length)).toFixed(2)),
    Alertas: r.alertasJornada.join(" | "),
  }));
  const t = totaisPlano(plano);
  linhas.push({
    Rota: "TOTAL",
    Veículo: `${t.veiculos} veículo(s)`,
    CD: "",
    Entregas: t.entregas,
    "Peso (kg)": Number(t.pesoKg.toFixed(3)),
    "Ocupação (%)": Number((t.ocupacaoMedia * 100).toFixed(1)),
    KM: Number(t.km.toFixed(1)),
    Duração: duracao(t.minutosOperacao),
    "Custo (R$)": Number(t.custo.toFixed(2)),
    "Custo por entrega (R$)": Number((t.custo / Math.max(1, t.entregas)).toFixed(2)),
    Alertas: "",
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Resumo");
  baixar(wb, arquivo(`${nomeProjeto}-resumo`));
}

/** Roteiro imprimível (PDF via diálogo de impressão do navegador). */
export function imprimirRoteiro(plano: Plano, nomeProjeto: string) {
  const t = totaisPlano(plano);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>${nomeProjeto} — roteiro</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;color:#141414;margin:24px}
    h1{font-size:18px;margin:0 0 4px}
    h2{font-size:14px;margin:18px 0 6px;padding-left:8px;border-left:4px solid #F15A24}
    p{font-size:12px;color:#555;margin:2px 0}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th,td{border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:left}
    th{background:#f5f5f5}
    @media print{h2{page-break-after:avoid}}
  </style></head><body>
  <h1>${nomeProjeto}</h1>
  <p>${t.veiculos} veículo(s) · ${t.entregas} entrega(s) · ${t.km.toFixed(1)} km · ${kg(t.pesoKg)} · ${brl(t.custo)}</p>
  ${plano.rotas
    .map(
      (r) => `<h2>${r.rotulo ?? r.veiculo.nome} — ${r.veiculo.nome}</h2>
      <p>${r.deposito?.nome ?? ""} · ${r.paradas.length} paradas · ${r.km.toFixed(1)} km · ${duracao(r.minutos)} · ${kg(r.pesoKg)} (${(r.ocupacaoPeso * 100).toFixed(0)}%)</p>
      <table><thead><tr><th>#</th><th>NF</th><th>Cliente</th><th>Endereço</th><th>Peso</th><th>Chegada</th><th>Janela</th><th>Obs.</th></tr></thead><tbody>
      ${r.paradas
        .map(
          (p) => `<tr><td>${p.ordem}</td><td>${p.entrega.nf ?? ""}</td><td>${p.entrega.cliente ?? ""}</td>
          <td>${p.entrega.endereco}</td><td>${kg(p.entrega.pesoKg)}</td><td>${minutosParaHora(p.chegadaMin)}</td>
          <td>${p.entrega.horarioEntrega ?? "-"}</td><td>${p.entrega.observacoes ?? ""}</td></tr>`,
        )
        .join("")}
      </tbody></table>`,
    )
    .join("")}
  </body></html>`;

  const win = window.open("", "_blank", "width=1024,height=768");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
