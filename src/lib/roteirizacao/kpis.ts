import type { Cenario, Rota } from "./tipos";

export type KpisOperacao = {
  entregas: number;
  veiculos: number;
  km: number;
  minutosOperacao: number;
  entregasPorHora: number;
  entregasPorVeiculo: number;
  kmPorEntrega: number;
  kmPorLitro: number;
  custoPorKm: number;
  custoPorEntrega: number;
  custoPorTonelada: number;
  pesoMedioKg: number;
  ocupacaoFrota: number;
  tempoMedioEntregaMin: number;
  tempoDeslocamentoMin: number;
  tempoParadoMin: number;
  eficiencia: number;
  aproveitamento: number;
};

export function calcularKpis(cenario: Cenario): KpisOperacao {
  const rotas = cenario.rotas;
  const entregas = cenario.entregasAtendidas || 1;
  const litros = rotas.reduce((s, r) => s + r.km / Math.max(0.5, r.veiculo.custos.consumoKmL), 0);
  const deslocamento = rotas.reduce((s, r) => s + r.minutosDirecao, 0);
  const parado = rotas.reduce((s, r) => s + r.minutosParado, 0);
  const capacidade = rotas.reduce((s, r) => s + r.veiculo.capacidadeKg, 0);
  const horasOperacao = Math.max(0.25, cenario.minutosOperacao / 60);

  return {
    entregas: cenario.entregasAtendidas,
    veiculos: cenario.veiculos,
    km: cenario.km,
    minutosOperacao: cenario.minutosOperacao,
    entregasPorHora: cenario.entregasAtendidas / horasOperacao,
    entregasPorVeiculo: cenario.entregasAtendidas / Math.max(1, cenario.veiculos),
    kmPorEntrega: cenario.km / entregas,
    kmPorLitro: litros > 0 ? cenario.km / litros : 0,
    custoPorKm: cenario.km > 0 ? cenario.custo / cenario.km : 0,
    custoPorEntrega: cenario.custo / entregas,
    custoPorTonelada: cenario.pesoKg > 0 ? cenario.custo / (cenario.pesoKg / 1000) : 0,
    pesoMedioKg: cenario.pesoKg / Math.max(1, cenario.veiculos),
    ocupacaoFrota: capacidade > 0 ? cenario.pesoKg / capacidade : 0,
    tempoMedioEntregaMin: (deslocamento + parado) / entregas,
    tempoDeslocamentoMin: deslocamento,
    tempoParadoMin: parado,
    eficiencia:
      deslocamento + parado > 0 ? deslocamento / (deslocamento + parado) : 0,
    aproveitamento: capacidade > 0 ? cenario.pesoKg / capacidade : 0,
  };
}

export type SimulacaoFinanceira = {
  receita: number;
  custoOperacional: number;
  lucroBruto: number;
  impostos: number;
  lucroLiquido: number;
  margem: number;
  custoPorEntrega: number;
  custoPorKm: number;
  custoPorTonelada: number;
};

export function simularFinanceiro(
  cenario: Cenario,
  opcoes: { receita?: number; impostoPct?: number; administrativoPct?: number } = {},
): SimulacaoFinanceira {
  const receita = opcoes.receita ?? cenario.receita;
  const admin = ((opcoes.administrativoPct ?? 0) / 100) * receita;
  const custoOperacional = cenario.custo + admin;
  const lucroBruto = receita - custoOperacional;
  const impostos = ((opcoes.impostoPct ?? 0) / 100) * receita;
  const lucroLiquido = lucroBruto - impostos;
  const entregas = Math.max(1, cenario.entregasAtendidas);
  return {
    receita,
    custoOperacional,
    lucroBruto,
    impostos,
    lucroLiquido,
    margem: receita > 0 ? lucroLiquido / receita : 0,
    custoPorEntrega: custoOperacional / entregas,
    custoPorKm: cenario.km > 0 ? custoOperacional / cenario.km : 0,
    custoPorTonelada: cenario.pesoKg > 0 ? custoOperacional / (cenario.pesoKg / 1000) : 0,
  };
}

export function rotaResumo(r: Rota) {
  return {
    id: r.id,
    veiculo: r.veiculo.nome,
    entregas: r.paradas.length,
    km: r.km,
    minutos: r.minutos,
    pesoKg: r.pesoKg,
    ocupacao: r.ocupacaoPeso,
    custo: r.custo.total,
  };
}
