import type { CategoriaVeiculo, CustosVeiculo, PerfilVeiculo, RegrasJornada } from "./tipos";

export const CUSTOS_PADRAO: CustosVeiculo = {
  consumoKmL: 8,
  precoCombustivel: 6.2,
  pedagioPorKm: 0.12,
  salarioDiario: 180,
  custoHora: 28,
  manutencaoKm: 0.35,
  depreciacaoKm: 0.4,
  seguroDia: 35,
  pneusKm: 0.18,
  outrosKm: 0.05,
};

/** Ordem de prioridade do menor para o maior — usada no cenário de menor custo. */
export const ORDEM_CATEGORIAS: CategoriaVeiculo[] = [
  "van",
  "vuc",
  "tres_quartos",
  "toco",
  "truck",
  "carreta",
];

export const ROTULO_CATEGORIA: Record<CategoriaVeiculo, string> = {
  van: "Van",
  vuc: "VUC",
  tres_quartos: "3/4",
  toco: "Toco",
  truck: "Truck",
  carreta: "Carreta",
};

const base = (
  categoria: CategoriaVeiculo,
  capacidadeKg: number,
  capacidadeM3: number,
  eixos: number,
  velocidadeMediaKmh: number,
  custos: Partial<CustosVeiculo>,
): PerfilVeiculo => ({
  id: categoria,
  nome: ROTULO_CATEGORIA[categoria],
  categoria,
  capacidadeKg,
  capacidadeM3,
  disponiveis: 3,
  velocidadeMediaKmh,
  eixos,
  custos: { ...CUSTOS_PADRAO, ...custos },
});

export const FROTA_PADRAO: PerfilVeiculo[] = [
  base("van", 1500, 7, 2, 42, { consumoKmL: 9.5, salarioDiario: 150, custoHora: 22, depreciacaoKm: 0.22, pneusKm: 0.08, manutencaoKm: 0.2, pedagioPorKm: 0.08 }),
  base("vuc", 3000, 14, 2, 38, { consumoKmL: 7.5, salarioDiario: 165, custoHora: 25, depreciacaoKm: 0.3, pneusKm: 0.12, manutencaoKm: 0.26, pedagioPorKm: 0.1 }),
  base("tres_quartos", 4000, 22, 2, 36, { consumoKmL: 6.5, salarioDiario: 175, custoHora: 27, depreciacaoKm: 0.34, pneusKm: 0.15, manutencaoKm: 0.3 }),
  base("toco", 6000, 32, 2, 34, { consumoKmL: 5.5, salarioDiario: 190, custoHora: 30, depreciacaoKm: 0.42, pneusKm: 0.2, manutencaoKm: 0.36, pedagioPorKm: 0.16 }),
  base("truck", 12000, 45, 3, 32, { consumoKmL: 4, salarioDiario: 215, custoHora: 34, depreciacaoKm: 0.55, pneusKm: 0.28, manutencaoKm: 0.45, pedagioPorKm: 0.24 }),
  base("carreta", 27000, 90, 6, 30, { consumoKmL: 2.6, salarioDiario: 260, custoHora: 42, depreciacaoKm: 0.8, pneusKm: 0.42, manutencaoKm: 0.62, pedagioPorKm: 0.45 }),
];

export const JORNADA_PADRAO: RegrasJornada = {
  maxDirecaoContinuaMin: 240,
  intervaloMin: 30,
  almocoMin: 60,
  maxDiarioMin: 480,
  toleranciaHoraExtraMin: 120,
};

/** Custo por km "seco" (sem tempo) — usado para ranquear veículos por eficiência. */
export function custoPorKm(v: PerfilVeiculo) {
  const c = v.custos;
  return (
    c.precoCombustivel / Math.max(0.5, c.consumoKmL) +
    c.pedagioPorKm +
    c.manutencaoKm +
    c.depreciacaoKm +
    c.pneusKm +
    c.outrosKm
  );
}
