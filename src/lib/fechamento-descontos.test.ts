import { describe, expect, it } from "vitest";
import { montarDescontosPendentes, type ItemPendente } from "./fechamento";

const compra: ItemPendente = { origem: "peca", id: "p1", data: "2026-11-25", valor: 75, fechamentoId: null, descricao: "filtro de óleo", placa: "ABC1D23" };
const antecipacao: ItemPendente = { origem: "antecipacao", id: "a1", data: "2026-11-20", valor: 300, fechamentoId: null, descricao: "adiantamento" };

describe("descontos automáticos do fechamento do motorista", () => {
  it("compra de 25/11 entra no fechamento de 16 a 30/11", () => {
    expect(montarDescontosPendentes([compra], "2026-11-16", "2026-11-30").map((d) => d.origemId)).toEqual(["p1"]);
  });
  it("compra de 25/11 não entra no fechamento de 01 a 15/11", () => {
    expect(montarDescontosPendentes([compra], "2026-11-01", "2026-11-15")).toHaveLength(0);
  });
  it("item já descontado em outro fechamento não entra de novo", () => {
    expect(montarDescontosPendentes([{ ...compra, fechamentoId: "f1" }], "2026-11-16", "2026-11-30")).toHaveLength(0);
  });
  it("antecipação sai rotulada como ANTECIPAÇÃO", () => {
    expect(montarDescontosPendentes([antecipacao], "2026-11-16", "2026-11-30")[0].descricao).toMatch(/^ANTECIPAÇÃO: ADIANTAMENTO/);
  });
});
