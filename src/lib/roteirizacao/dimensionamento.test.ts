import { describe, expect, it } from "vitest";
import { simularCenarios } from "./cenarios";
import { FROTA_PADRAO, JORNADA_PADRAO } from "./frota";
import type { Entrega } from "./tipos";

const deposito = { id: "cd", nome: "CD", endereco: "Cotia", lat: -23.6, lng: -46.9 };
const entregas: Entrega[] = Array.from({ length: 30 }, (_, i) => ({
  id: `e${i}`, endereco: `E${i}`, pesoKg: 5, tempoDescargaMin: 5,
  lat: -23.55 + (i % 5) * 0.004, lng: -46.65 + Math.floor(i / 5) * 0.004,
}));
const van = FROTA_PADRAO.find((v) => v.categoria === "van")!;

describe("dimensionamento por notas", () => {
  it("30 entregas leves com máx. de 10 notas usam 3 vans", () => {
    const frota = [{ ...van, disponiveis: 10, maxEntregas: 10 }];
    const r = simularCenarios({ entregas, deposito, frota, jornada: JORNADA_PADRAO, opcoes: { consolidarRotas: false } });
    const c = r.cenarios.find((x) => x.id === r.recomendado)!;
    expect(c.rotas.length).toBe(3);
    expect(c.entregasNaoAtendidas.length).toBe(0);
  });

  it("modo cotação atende tudo mesmo com 0 disponíveis", () => {
    const frota = FROTA_PADRAO.map((v) => ({ ...v, disponiveis: 0, maxEntregas: 10 }));
    const r = simularCenarios({ entregas, deposito, frota, jornada: JORNADA_PADRAO, opcoes: { modoCotacao: true, consolidarRotas: false } });
    for (const c of r.cenarios) expect(c.entregasNaoAtendidas.length).toBe(0);
  });
});
