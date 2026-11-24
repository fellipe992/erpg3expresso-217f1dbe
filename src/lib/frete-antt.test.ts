import { describe, expect, it } from "vitest";
import { calcularPisoAntt, eixosSugeridos } from "./frete-antt";

const base = { lotacao: true, tabela: "A" as const, tipoCarga: "carga_geral" as const, eixos: 2 as const, km: 100 };

describe("piso mínimo ANTT", () => {
  it("piso = CCD × km + CC (carga geral, 2 eixos, tabela A, Res. 6.084/2026)", () => {
    const r = calcularPisoAntt(base);
    expect(r.aplica && r.piso).toBe(850.1);
  });
  it("retorno vazio soma 0,92 × CCD × km de volta", () => {
    const r = calcularPisoAntt({ ...base, retornoVazio: true });
    expect(r.aplica && r.valorRetorno).toBe(366.4);
    expect(r.aplica && r.piso).toBe(1216.5);
  });
  it("carga fracionada não tem piso", () => {
    expect(calcularPisoAntt({ ...base, lotacao: false }).aplica).toBe(false);
  });
  it("frete combinado abaixo do piso é sinalizado", () => {
    const r = calcularPisoAntt({ ...base, freteCombinado: 800 });
    expect(r.aplica && r.dentroDoPiso).toBe(false);
  });
});

describe("eixos sugeridos por categoria", () => {
  it("bitruck sugere 4 eixos", () => {
    expect(eixosSugeridos("bitruck")).toBe(4);
  });
  it("truck sugere 3 eixos e vuc sugere 2", () => {
    expect(eixosSugeridos("truck")).toBe(3);
    expect(eixosSugeridos("vuc")).toBe(2);
  });
});
