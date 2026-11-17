import { ROTULO_CATEGORIA } from "./frota";
import type { CategoriaVeiculo, Rota } from "./tipos";

export type LinhaDimensionamento = {
  categoria: CategoriaVeiculo;
  nome: string;
  veiculos: number;
  notas: number;
  notasMedia: number;
  notasMax: number;
  pesoMedioKg: number;
  ocupacaoMedia: number;
  custo: number;
  limitadoPorNotas: number;
  limitadoPorPeso: number;
};

/** Agrupa as rotas por tipo de veículo para mostrar quantos carros a operação exige. */
export function dimensionarFrota(rotas: Rota[]): LinhaDimensionamento[] {
  const grupos = new Map<CategoriaVeiculo, Rota[]>();
  for (const r of rotas) {
    const k = r.veiculo.categoria;
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }
  return [...grupos.entries()].map(([categoria, lista]) => {
    const notas = lista.reduce((s, r) => s + r.paradas.length, 0);
    const porNotas = lista.filter(
      (r) => !!r.veiculo.maxEntregas && r.paradas.length >= r.veiculo.maxEntregas,
    ).length;
    return {
      categoria,
      nome: ROTULO_CATEGORIA[categoria] ?? lista[0].veiculo.nome,
      veiculos: lista.length,
      notas,
      notasMedia: notas / lista.length,
      notasMax: Math.max(...lista.map((r) => r.paradas.length)),
      pesoMedioKg: lista.reduce((s, r) => s + r.pesoKg, 0) / lista.length,
      ocupacaoMedia: lista.reduce((s, r) => s + r.ocupacaoPeso, 0) / lista.length,
      custo: lista.reduce((s, r) => s + r.custo.total, 0),
      limitadoPorNotas: porNotas,
      limitadoPorPeso: lista.length - porNotas,
    };
  }).sort((a, b) => b.veiculos - a.veiculos);
}
