import { describe, expect, it } from "vitest";
import { limparTranscricao } from "./transcricao";

describe("limparTranscricao", () => {
  it("trecho só de ruído vira vazio (não entra no campo)", () => {
    expect(limparTranscricao("<noise>")).toBe("");
    expect(limparTranscricao(" [silêncio] ")).toBe("");
  });
  it("mantém a fala e tira as marcações no meio", () => {
    expect(limparTranscricao("O cliente quer <noise> frete para Campinas.")).toBe("O cliente quer frete para Campinas.");
  });
});
