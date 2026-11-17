import { describe, expect, it } from "vitest";
import { resumirFatura, type ItemFatura } from "./fatura-fornecedor";

const item = (id: string, valor: number, status: string | null): ItemFatura => ({
  id, data: "2026-11-20", descricao: "DIESEL", fornecedor: "POSTO X", placa: "ABC1D23", valor,
  lancamentoId: "l" + id, lancamentoStatus: status, planoContaId: null, centroCusto: null,
});

describe("fatura unificada de posto/fornecedor", () => {
  it("soma todos os itens selecionados do período numa fatura só", () => {
    const itens = [item("a", 100.1, "pendente"), item("b", 200.2, "atrasado"), item("c", 50, "pendente")];
    expect(resumirFatura(itens, new Set(["a", "b", "c"])).total).toBe(350.3);
  });
  it("item não selecionado fica fora", () => {
    const itens = [item("a", 100, "pendente"), item("b", 200, "pendente")];
    expect(resumirFatura(itens, new Set(["a"])).total).toBe(100);
  });
  it("item já pago individualmente nunca entra na fatura", () => {
    const itens = [item("a", 100, "pago"), item("b", 200, "pendente")];
    const r = resumirFatura(itens, new Set(["a", "b"]));
    expect(r.escolhidos.map((i) => i.id)).toEqual(["b"]);
    expect(r.total).toBe(200);
  });
});
