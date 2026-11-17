import { describe, expect, it } from "vitest";
import { simularCenarios } from "./cenarios";
import { FROTA_PADRAO, JORNADA_PADRAO } from "./frota";
import type { Entrega } from "./tipos";

// Pontos reais de uma roteirização da Grande SP (CD em Embu das Artes).
const PONTOS: [string, number, number, number][] = [
  ["Pinheiros", -23.5604, -46.67335, 107.52],
  ["Granja Viana", -23.59028, -46.82604, 92.16],
  ["Alto de Pinheiros", -23.54287, -46.71125, 76.8],
  ["Lapa", -23.52606, -46.73306, 76.8],
  ["Vila Alexandria", -23.64399, -46.66717, 84.48],
  ["Jardim Universidade Pinheiros", -23.55137, -46.72216, 84.48],
  ["Vila Suzana", -23.61748, -46.7431, 92.16],
  ["Higienópolis", -23.5463, -46.65875, 84.48],
  ["Mooca", -23.55089, -46.59576, 92.16],
  ["Campo Belo", -23.61907, -46.67198, 92.16],
  ["Vila Nova Conceição", -23.60163, -46.67375, 92.16],
  ["Indianópolis", -23.60275, -46.66494, 92.16],
  ["Santos", -23.96293, -46.32326, 92.16],
  ["Vila Gomes Cardim", -23.54146, -46.56745, 92.16],
  ["Morumbi", -23.61702, -46.70782, 84.48],
  ["Vila Olímpia", -23.60006, -46.67899, 92.16],
  ["Santana", -23.49096, -46.62599, 84.48],
  ["Vila Prudente", -23.57975, -46.59437, 84.48],
  ["Campinas", -22.89247, -47.02745, 84.48],
  ["Casa Verde", -23.50822, -46.6487, 84.48],
  ["Alphaville", -23.47686, -46.8662, 92.16],
  ["Vila Mariana", -23.59156, -46.62083, 69.12],
  ["Jardim Paulista", -23.57825, -46.67085, 61.44],
  ["Cidade Monções", -23.61507, -46.68497, 92.16],
  ["Pompeia", -23.53499, -46.68732, 92.16],
  ["Chácara Flora", -23.65747, -46.69172, 92.16],
  ["Itaim Bibi", -23.58318, -46.6869, 92.16],
];
const entregas: Entrega[] = PONTOS.map(([nome, lat, lng, pesoKg]) => ({
  id: nome, endereco: nome, lat, lng, pesoKg, tempoDescargaMin: 20,
}));
const deposito = { id: "cd", nome: "CD", endereco: "Embu das Artes", lat: -23.6436308, lng: -46.9022307 };
const frota = FROTA_PADRAO.map((v) => ({ ...v, disponiveis: 0, maxEntregas: v.categoria === "fiorino" ? 4 : undefined }));
const resultado = simularCenarios({
  entregas, deposito, frota, jornada: JORNADA_PADRAO,
  opcoes: { modoCotacao: true, consolidarRotas: true, ocupacaoMinima: 0.8 },
});
const recomendado = resultado.cenarios.find((c) => c.id === resultado.recomendado)!;
const rotaDe = (nome: string) =>
  recomendado.rotas.findIndex((r) => r.paradas.some((p) => p.entrega.id === nome));

describe("roteirização agrupa entregas próximas", () => {
  it("atende as 27 entregas", () => {
    expect(recomendado.entregasAtendidas).toBe(27);
  });

  it("Santos e Campinas nunca saem no mesmo veículo", () => {
    for (const c of resultado.cenarios) {
      const santos = c.rotas.findIndex((r) => r.paradas.some((p) => p.entrega.id === "Santos"));
      const campinas = c.rotas.findIndex((r) => r.paradas.some((p) => p.entrega.id === "Campinas"));
      expect(santos).not.toBe(campinas);
    }
  });

  it("Alphaville vai no mesmo veículo de Campinas", () => {
    expect(rotaDe("Alphaville")).toBe(rotaDe("Campinas"));
  });

  it("Zona Norte não divide veículo com o extremo sul", () => {
    for (const norte of ["Santana", "Casa Verde"])
      for (const sul of ["Chácara Flora", "Vila Alexandria", "Campo Belo"])
        expect(rotaDe(norte)).not.toBe(rotaDe(sul));
  });

  it("Santos não sobe para a Zona Norte nem para o centro", () => {
    for (const c of resultado.cenarios) {
      const santos = c.rotas.find((r) => r.paradas.some((p) => p.entrega.id === "Santos"))!;
      const nomes = santos.paradas.map((p) => p.entrega.id);
      for (const longe of ["Santana", "Casa Verde", "Higienópolis", "Pompeia", "Lapa", "Mooca"])
        expect(nomes).not.toContain(longe);
    }
  });

  it("Santos leva as entregas que ficam no caminho (Vila Mascote / Chácara Flora)", () => {
    const santos = recomendado.rotas.find((r) => r.paradas.some((p) => p.entrega.id === "Santos"))!;
    const nomes = santos.paradas.map((p) => p.entrega.id);
    expect(nomes).toContain("Vila Alexandria");
    expect(nomes).toContain("Chácara Flora");
  });

  it("sem disponibilidade marcada, o modo cotação usa só o tipo com limite de notas (Fiorino)", () => {
    for (const c of resultado.cenarios)
      for (const r of c.rotas) expect(r.veiculo.categoria).toBe("fiorino");
  });

  it("Fiorino nunca passa de 4 notas", () => {
    for (const c of resultado.cenarios)
      for (const r of c.rotas)
        if (r.veiculo.categoria === "fiorino") expect(r.paradas.length).toBeLessThanOrEqual(4);
  });
});
