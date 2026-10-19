import { describe, expect, it } from "vitest";
import { pontosAcidente } from "./zonas-oficiais.server";
import { zonaNoPonto, type ZonaRisco } from "./zonas-risco";

const zona = (p: Partial<ZonaRisco>): ZonaRisco => ({
  id: "z", nome: "z", tipo: "acidente", nivel: 3, lat: -23.5, lng: -46.6, raio_m: 2000,
  uf: "SP", horario_critico: null, recomendacao: null, origem: "prf", ...p,
});

describe("zonas oficiais", () => {
  it("acidente simples vale 1, com feridos 2, com mortos 5", () => {
    expect(pontosAcidente(0, 0)).toBe(1);
    expect(pontosAcidente(3, 0)).toBe(2);
    expect(pontosAcidente(3, 1)).toBe(5);
  });

  it("regiões da SSP-SP não disparam alerta no ponto", () => {
    const p = { lat: -23.5, lng: -46.6 };
    expect(zonaNoPonto([zona({ origem: "ssp", nivel: 4, raio_m: 40000 })], p)).toBeNull();
    expect(zonaNoPonto([zona({ origem: "prf", nivel: 4 })], p)?.nivel).toBe(4);
  });
});
