import { describe, expect, it } from "vitest";
import {
  casarMotorista,
  casarVeiculo,
  dataPrevistaPorOpcao,
  enderecoPareceCortado,
  normalizarCpf,
  normalizarPlaca,
  ordenarDestinos,
} from "./importar-viagem";

describe("importar-viagem", () => {
  it("normaliza placa e CPF removendo pontuação", () => {
    expect(normalizarPlaca("pfy-3j16")).toBe("PFY3J16");
    expect(normalizarCpf("387.251.398-27")).toBe("38725139827");
  });

  it("calcula hoje e amanhã no fuso America/Sao_Paulo", () => {
    // 2026-11-25 22:57 UTC = 19:57 em São Paulo (ainda dia 25/11)
    const agora = new Date("2026-11-25T22:57:00Z");
    expect(dataPrevistaPorOpcao("hoje", agora)).toEqual({
      ymd: "2026-11-25",
      dataBr: "25/11/2026",
      iso: "2026-11-25T08:00:00-03:00",
    });
    expect(dataPrevistaPorOpcao("amanha", agora)).toEqual({
      ymd: "2026-11-26",
      dataBr: "26/11/2026",
      iso: "2026-11-26T08:00:00-03:00",
    });
  });

  it("casa veículo pela placa e motorista por CPF, vínculo ou nome", () => {
    const veiculos = [{ id: "v1", placa: "PFY3J16", modelo: "FURGAO" }];
    const motoristas = [
      { id: "m1", nome: "ALLAN DELLON ARAUJO LOIOLA", cpf: "38725139827", veiculo_id: null },
      { id: "m2", nome: "TIAGO SILVA", cpf: "11122233344", veiculo_id: "v1" },
    ];
    expect(casarVeiculo("PFY-3J16", veiculos)?.id).toBe("v1");
    expect(casarMotorista({ cpf: "387.251.398-27", veiculoId: "v1" }, motoristas)?.id).toBe("m1");
    expect(casarMotorista({ cpf: "", veiculoId: "v1" }, motoristas)?.id).toBe("m2");
    expect(casarMotorista({ nome: "Allan Dellon Araujo Loiola" }, motoristas)?.id).toBe("m1");
  });

  it("identifica endereço cortado e ordena destinos por sequência", () => {
    expect(enderecoPareceCortado("R. ANTONIO RAPOSO BARRETO,")).toBe(true);
    expect(enderecoPareceCortado("R. BARBOSA VILAS BOAS, 251")).toBe(false);
    const ord = ordenarDestinos([{ sequencia: "999" }, { sequencia: "002" }, { sequencia: "001" }]);
    expect(ord.map((d) => d.sequencia)).toEqual(["001", "002", "999"]);
  });
});