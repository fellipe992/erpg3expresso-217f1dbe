import { describe, expect, it } from "vitest";
import { clausulas, clausulasPadrao, parseModeloContrato, type DadosContrato } from "./contrato-motorista";

const DADOS: DadosContrato = {
  razao_social: "TRANSPORTES EXEMPLO LTDA",
  cnpj: "12.345.678/0001-90",
  rntrc: "12345678",
  motorista_nome: "JOAO SILVA",
  motorista_cpf: "111.222.333-44",
  motorista_cnh: "99999999999",
  placa: "ABC1D23",
  prazo_texto: "fechamento quinzenal com pagamento em 10 dias",
};

describe("contrato-motorista", () => {
  it("enquadra a operação como distribuição urbana fracionada com base na Lei 13.703/2018", () => {
    const lista = clausulas(DADOS);
    const texto = lista.flatMap((c) => c.itens).join(" ");
    expect(texto).toContain("distribuição urbana e regional fracionada");
    expect(texto).toContain("múltiplas entregas, múltiplos destinatários e notas fiscais distintas");
    expect(texto).toContain("Art. 1º, § 2º da Lei Federal nº 13.703/2018");
    expect(texto).toContain("raios de quilometragem pré-definidos");
    expect(texto).toContain("fechamento quinzenal com pagamento em 10 dias");
  });

  it("aplica modelo personalizado quando fornecido e valida estrutura", () => {
    const custom = parseModeloContrato([{ titulo: "1. TESTE", itens: ["Prazo: {{PRAZO_TEXTO}}"] }]);
    expect(custom).not.toBeNull();
    const lista = clausulas(DADOS, custom);
    expect(lista).toHaveLength(2);
    expect(lista[1]?.itens[0]).toBe("Prazo: fechamento quinzenal com pagamento em 10 dias");
    expect(parseModeloContrato([])).toBeNull();
    expect(clausulasPadrao().length).toBeGreaterThanOrEqual(13);
  });
});