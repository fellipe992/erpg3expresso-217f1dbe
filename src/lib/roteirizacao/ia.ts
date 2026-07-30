import { montarRota, somarCustos } from "./cenarios";
import type { Cenario, Deposito, RegrasJornada, Rota } from "./tipos";
import type { Coordenada, Entrega } from "./tipos";

export type Sugestao = {
  id: string;
  titulo: string;
  detalhe: string;
  impacto: "alto" | "medio" | "baixo";
  /** ação aplicável automaticamente */
  acao?:
    | { tipo: "consolidar_rota"; rotaId: string }
    | { tipo: "reotimizar_sequencia"; rotaId: string }
    | { tipo: "trocar_cenario"; alvo: Cenario["id"] };
};

const OCUPACAO_BAIXA = 0.5;

export function analisarCenario(
  cenario: Cenario,
  todos: Cenario[],
  jornada: RegrasJornada,
): Sugestao[] {
  const s: Sugestao[] = [];
  if (!cenario.rotas.length) return s;

  const ociosas = cenario.rotas
    .filter((r) => r.ocupacaoPeso < OCUPACAO_BAIXA)
    .sort((a, b) => a.ocupacaoPeso - b.ocupacaoPeso);
  ociosas.forEach((r) => {
    s.push({
      id: `ocupacao-${r.id}`,
      titulo: `Veículo com baixa ocupação (${(r.ocupacaoPeso * 100).toFixed(0)}%)`,
      detalhe: `A rota ${r.id} usa um ${r.veiculo.nome} com apenas ${Math.round(r.pesoKg)} kg de ${r.veiculo.capacidadeKg} kg. É possível redistribuir as entregas e eliminar este veículo.`,
      impacto: "alto",
      acao: { tipo: "consolidar_rota", rotaId: r.id },
    });
  });

  cenario.rotas.forEach((r) => {
    const ganho = ganhoReotimizacao(r);
    if (ganho > 3) {
      s.push({
        id: `sequencia-${r.id}`,
        titulo: `Entregas fora da sequência ideal na rota ${r.id}`,
        detalhe: `Reordenando as paradas é possível reduzir aproximadamente ${ganho.toFixed(0)} km.`,
        impacto: ganho > 15 ? "alto" : "medio",
        acao: { tipo: "reotimizar_sequencia", rotaId: r.id },
      });
    }
    if (r.minutos > jornada.maxDiarioMin) {
      s.push({
        id: `jornada-${r.id}`,
        titulo: `Jornada excedida na rota ${r.id}`,
        detalhe: `O motorista do ${r.veiculo.nome} ficaria ${((r.minutos - jornada.maxDiarioMin) / 60).toFixed(1)}h além do limite diário. Divida a carga ou programe para o dia seguinte.`,
        impacto: "alto",
      });
    }
    const atrasadas = r.paradas.filter((p) => p.atrasada);
    if (atrasadas.length) {
      s.push({
        id: `atraso-${r.id}`,
        titulo: `${atrasadas.length} entrega(s) com risco de atraso`,
        detalhe: `Na rota ${r.id} há entregas com previsão de chegada após a janela combinada. Antecipe-as na sequência ou transfira para outro veículo.`,
        impacto: "alto",
      });
    }
  });

  const menorKm = todos.reduce((a, b) => (b.km > 0 && b.km < a.km ? b : a), cenario);
  if (menorKm.id !== cenario.id && cenario.km - menorKm.km > 5) {
    s.push({
      id: "cenario-km",
      titulo: `A rota pode ser reduzida em aproximadamente ${Math.round(cenario.km - menorKm.km)} km`,
      detalhe: `O cenário "${menorKm.nome}" percorre ${Math.round(menorKm.km)} km contra ${Math.round(cenario.km)} km deste cenário.`,
      impacto: "medio",
      acao: { tipo: "trocar_cenario", alvo: menorKm.id },
    });
  }

  const maisRapido = todos.reduce(
    (a, b) => (b.minutosOperacao > 0 && b.minutosOperacao < a.minutosOperacao ? b : a),
    cenario,
  );
  if (maisRapido.id !== cenario.id && cenario.minutosOperacao - maisRapido.minutosOperacao > 45) {
    s.push({
      id: "cenario-tempo",
      titulo: "Trocando entregas entre veículos é possível economizar tempo",
      detalhe: `O cenário "${maisRapido.nome}" conclui a operação ${(
        (cenario.minutosOperacao - maisRapido.minutosOperacao) /
        60
      ).toFixed(1)}h antes.`,
      impacto: "medio",
      acao: { tipo: "trocar_cenario", alvo: maisRapido.id },
    });
  }

  const regioes = new Map<string, number>();
  cenario.rotas.forEach((r) =>
    r.paradas.forEach((p) => {
      const reg = p.entrega.regiao || p.entrega.endereco.split(",")[1]?.trim() || "Outros";
      regioes.set(reg, (regioes.get(reg) ?? 0) + 1);
    }),
  );
  const espalhadas = [...regioes.entries()].filter(([, q]) => q === 1);
  if (espalhadas.length > 2) {
    s.push({
      id: "agrupamento",
      titulo: "Existem regiões que poderiam ser agrupadas",
      detalhe: `${espalhadas.length} regiões têm apenas uma entrega isolada. Agrupá-las em um mesmo dia ou veículo reduz deslocamento improdutivo.`,
      impacto: "baixo",
    });
  }

  if (cenario.entregasNaoAtendidas.length) {
    s.push({
      id: "nao-atendidas",
      titulo: `${cenario.entregasNaoAtendidas.length} entrega(s) sem veículo disponível`,
      detalhe: "Aumente a disponibilidade da frota ou contrate um agregado para atender a demanda.",
      impacto: "alto",
    });
  }

  return s;
}

/** Estima o ganho (km) de uma re-sequenciação mais agressiva da rota. */
function ganhoReotimizacao(r: Rota) {
  if (r.paradas.length < 4) return 0;
  const pontos = r.paradas.map((p) => p.entrega as Entrega & Coordenada);
  let cruzamentos = 0;
  for (let i = 1; i < pontos.length - 1; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    const c = pontos[i + 1];
    const ang = Math.abs(
      Math.atan2(b.lat - a.lat, b.lng - a.lng) - Math.atan2(c.lat - b.lat, c.lng - b.lng),
    );
    if (ang > Math.PI * 0.75) cruzamentos++;
  }
  return (cruzamentos / Math.max(1, r.paradas.length)) * r.km * 0.25;
}

export function aplicarSugestao(
  cenario: Cenario,
  sugestao: Sugestao,
  ctx: { deposito: Deposito; jornada: RegrasJornada },
): Cenario {
  if (!sugestao.acao) return cenario;
  const rotas = [...cenario.rotas];
  const acao = sugestao.acao;

  if (acao.tipo === "reotimizar_sequencia") {
    const idx = rotas.findIndex((r) => r.id === acao.rotaId);
    if (idx < 0) return cenario;
    const alvo = rotas[idx];
    rotas[idx] = montarRota(
      alvo.id,
      alvo.veiculo,
      {
        entregas: alvo.paradas.map((p) => p.entrega as Entrega & Coordenada),
        pesoKg: alvo.pesoKg,
        volumeM3: alvo.volumeM3,
      },
      ctx.deposito,
      ctx.jornada,
      12,
    );
  }

  if (sugestao.acao.tipo === "consolidar_rota") {
    const alvoId = sugestao.acao.rotaId;
    const idx = rotas.findIndex((r) => r.id === alvoId);
    if (idx < 0 || rotas.length < 2) return cenario;
    const [removida] = rotas.splice(idx, 1);
    const pendentes = removida.paradas.map((p) => p.entrega as Entrega & Coordenada);
    const naoAlocadas: (Entrega & Coordenada)[] = [];

    pendentes.forEach((e) => {
      const destino = rotas
        .filter((r) => r.pesoKg + e.pesoKg <= r.veiculo.capacidadeKg)
        .sort((a, b) => a.ocupacaoPeso - b.ocupacaoPeso)[0];
      if (!destino) {
        naoAlocadas.push(e);
        return;
      }
      const entregas = [...destino.paradas.map((p) => p.entrega as Entrega & Coordenada), e];
      const nova = montarRota(
        destino.id,
        destino.veiculo,
        {
          entregas,
          pesoKg: entregas.reduce((s, x) => s + x.pesoKg, 0),
          volumeM3: entregas.reduce((s, x) => s + (x.volumeM3 ?? 0), 0),
        },
        ctx.deposito,
        ctx.jornada,
        8,
      );
      rotas[rotas.indexOf(destino)] = nova;
    });

    if (naoAlocadas.length === pendentes.length) return cenario;
    return recomputar(cenario, rotas, [...cenario.entregasNaoAtendidas, ...naoAlocadas]);
  }

  return recomputar(cenario, rotas, cenario.entregasNaoAtendidas);
}

export function recomputar(base: Cenario, rotas: Rota[], naoAtendidas: Entrega[]): Cenario {
  const custoDetalhado = somarCustos(rotas.map((r) => r.custo));
  const receitaEntregas = rotas.reduce((s, r) => s + r.receita, 0);
  return {
    ...base,
    rotas,
    veiculos: rotas.length,
    km: rotas.reduce((s, r) => s + r.km, 0),
    minutos: rotas.reduce((s, r) => s + r.minutos, 0),
    minutosOperacao: rotas.length ? Math.max(...rotas.map((r) => r.minutos)) : 0,
    pesoKg: rotas.reduce((s, r) => s + r.pesoKg, 0),
    custo: custoDetalhado.total,
    custoDetalhado,
    receita: receitaEntregas > 0 ? receitaEntregas : base.receita,
    ocupacaoMedia: rotas.length
      ? rotas.reduce((s, r) => s + r.ocupacaoPeso, 0) / rotas.length
      : 0,
    entregasAtendidas: rotas.reduce((s, r) => s + r.paradas.length, 0),
    entregasNaoAtendidas: naoAtendidas,
  };
}
