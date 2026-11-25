import { describe, expect, it } from "vitest";

import { reoteirizarDevolucoes, rotasEnviadasDoProjeto, type StatusParadaProjeto } from "./devolucoes";
import { gerarPlano } from "./roteirizacao/plano";
import { JORNADA_PADRAO } from "./roteirizacao/frota";
import type { Deposito, Entrega, OpcoesOtimizacao, PerfilVeiculo } from "./roteirizacao/tipos";

const OPCOES_PADRAO: OpcoesOtimizacao = {
  modo: "insercao",
  ignorarCubagem: true,
  consolidarRotas: true,
  ocupacaoMinima: 0.4,
  raioProximidadeKm: null,
};

const DEP: Deposito = {
  id: "dep-1",
  nome: "CD SP",
  endereco: "São Paulo - SP",
  lat: -23.55,
  lng: -46.63,
};

const CUSTOS = {
  consumoKmL: 8,
  precoCombustivel: 6,
  pedagioPorKm: 0,
  salarioDiario: 200,
  custoHora: 30,
  manutencaoKm: 0.4,
  depreciacaoKm: 0.2,
  seguroDia: 30,
  pneusKm: 0.1,
  outrosKm: 0.1,
};

const VAN: PerfilVeiculo = {
  id: "van",
  nome: "Van",
  categoria: "van",
  capacidadeKg: 1500,
  capacidadeM3: 10,
  disponiveis: 2,
  maxEntregas: 3,
  velocidadeMediaKmh: 35,
  eixos: 2,
  custos: CUSTOS,
};

function entrega(id: string, lat: number, lng: number): Entrega {
  return {
    id,
    cliente: `CLIENTE ${id}`,
    endereco: `Rua ${id}`,
    pesoKg: 100,
    tempoDescargaMin: 15,
    lat,
    lng,
  };
}

describe("reoteirizarDevolucoes", () => {
  it("realoca devolução total na rota aberta mais próxima e rebalanceia quando atinge limite de paradas", () => {
    // 2 rotas abertas: Rota Norte (3 entregas, já no limite maxEntregas=3) e Rota Sul (1 entrega)
    const e1 = entrega("N1", -23.48, -46.63);
    const e2 = entrega("N2", -23.49, -46.62);
    const e3 = entrega("M1", -23.54, -46.63); // intermediária, pode migrar para a rota Sul
    const e4 = entrega("S1", -23.62, -46.63);

    const planoInicial = gerarPlano({
      entregas: [e1, e2, e3, e4],
      depositos: [DEP],
      frota: [VAN],
      jornada: JORNADA_PADRAO,
      opcoes: OPCOES_PADRAO,
    });

    // Devolução total na Zona Norte (próxima de N1 e N2)
    const devolvida = entrega("DEV-N", -23.485, -46.625);

    const res = reoteirizarDevolucoes({
      plano: planoInicial,
      devolvidas: [devolvida],
      rotasDespachadasIds: new Set(),
      depositos: [DEP],
      jornada: JORNADA_PADRAO,
      opcoes: OPCOES_PADRAO,
    });

    expect(res.realocadas).toBe(1);
    expect(res.naoAlocadas).toBe(0);
    // Todas as 5 entregas (4 originais + 1 devolvida) devem estar alocadas sem estourar maxEntregas=3
    const totalParadas = res.plano.rotas.reduce((s, r) => s + r.paradas.length, 0);
    expect(totalParadas).toBe(5);
    for (const r of res.plano.rotas) {
      expect(r.paradas.length).toBeLessThanOrEqual(3);
    }
  });

  it("preserva rotas já despachadas intactas e não as modifica", () => {
    const e1 = entrega("A1", -23.48, -46.63);
    const e2 = entrega("A2", -23.62, -46.63);
    const planoInicial = gerarPlano({
      entregas: [e1, e2],
      depositos: [DEP],
      frota: [VAN],
      jornada: JORNADA_PADRAO,
      opcoes: OPCOES_PADRAO,
    });

    const primeiraRota = planoInicial.rotas[0]!;
    const devolvida = entrega("DEV-1", -23.50, -46.63);

    const res = reoteirizarDevolucoes({
      plano: planoInicial,
      devolvidas: [devolvida],
      rotasDespachadasIds: new Set([primeiraRota.id]),
      depositos: [DEP],
      jornada: JORNADA_PADRAO,
      opcoes: OPCOES_PADRAO,
    });

    const rotaPreservada = res.plano.rotas.find((r) => r.id === primeiraRota.id);
    expect(rotaPreservada?.paradas.map((p) => p.entrega.id)).toEqual(
      primeiraRota.paradas.map((p) => p.entrega.id),
    );
  });

  it("remove a entrega devolvida da rota já despachada para não duplicar paradas", () => {
    const e1 = entrega("N1", -23.48, -46.63);
    const e2 = entrega("N2", -23.49, -46.62);
    const e3 = entrega("N3", -23.50, -46.62);
    const e4 = entrega("S1", -23.62, -46.63);

    const planoInicial = gerarPlano({
      entregas: [e1, e2, e3, e4],
      depositos: [DEP],
      frota: [VAN],
      jornada: JORNADA_PADRAO,
      opcoes: OPCOES_PADRAO,
    });

    const rotaDespachada = planoInicial.rotas.find((r) => r.paradas.length >= 2)!;
    const devolvida = rotaDespachada.paradas[0]!.entrega;

    const res = reoteirizarDevolucoes({
      plano: planoInicial,
      devolvidas: [devolvida],
      rotasDespachadasIds: new Set([rotaDespachada.id]),
      depositos: [DEP],
      jornada: JORNADA_PADRAO,
      opcoes: OPCOES_PADRAO,
    });

    const todosIds = res.plano.rotas.flatMap((r) => r.paradas.map((p) => p.entrega.id));
    const ocorrenciasDevolvida = todosIds.filter((id) => id === devolvida.id).length;
    expect(ocorrenciasDevolvida).toBe(1);

    const rotaFixaAtualizada = res.plano.rotas.find((r) => r.id === rotaDespachada.id)!;
    expect(rotaFixaAtualizada.paradas.some((p) => p.entrega.id === devolvida.id)).toBe(false);
  });

  it("reconhece rotas já despachadas a partir de paradasProjeto ao reabrir um projeto salvo", () => {
    const e1 = entrega("N1", -23.48, -46.63);
    const e2 = entrega("N2", -23.49, -46.62);
    const e3 = entrega("N3", -23.50, -46.62);
    const e4 = entrega("S1", -23.62, -46.63);

    const planoInicial = gerarPlano({
      entregas: [e1, e2, e3, e4],
      depositos: [DEP],
      frota: [VAN],
      jornada: JORNADA_PADRAO,
      opcoes: OPCOES_PADRAO,
    });

    const rotaEnviada = planoInicial.rotas[0]!;
    const rotaAberta = planoInicial.rotas[1]!;

    const paradasProjeto: StatusParadaProjeto[] = rotaEnviada.paradas.map((p, idx) => ({
      paradaId: `p-${idx}`,
      viagemId: "viagem-123",
      entregaOrigemId: p.entrega.id,
      cliente: p.entrega.cliente ?? null,
      endereco: p.entrega.endereco,
      nf: null,
      statusEntrega: idx === 0 ? "devolucao_total" : "entregue",
      motivoDevolucao: idx === 0 ? "CLIENTE AUSENTE" : null,
      entregueEm: idx === 0 ? null : "2026-11-23T12:00:00Z",
      devolucaoEm: idx === 0 ? "2026-11-23T12:30:00Z" : null,
    }));

    const enviadas = rotasEnviadasDoProjeto(planoInicial.rotas, {}, paradasProjeto);
    expect(enviadas[rotaEnviada.id]).toBe("viagem-123");
    expect(enviadas[rotaAberta.id]).toBeUndefined();
  });
});