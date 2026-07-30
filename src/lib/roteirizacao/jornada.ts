import type { RegrasJornada, Rota } from "./tipos";

/** Avalia as regras de jornada de uma rota e devolve os alertas encontrados. */
export function avaliarJornada(rota: Rota, regras: RegrasJornada): string[] {
  const alertas: string[] = [];
  const { minutosDirecao, minutos } = rota;

  if (minutosDirecao > regras.maxDirecaoContinuaMin) {
    const paradas = Math.floor(minutosDirecao / regras.maxDirecaoContinuaMin);
    alertas.push(
      `Direção de ${Math.round(minutosDirecao / 60)}h exige ${paradas} intervalo(s) de ${regras.intervaloMin}min.`,
    );
  }
  if (minutos > regras.maxDiarioMin) {
    const extra = minutos - regras.maxDiarioMin;
    alertas.push(
      extra > regras.toleranciaHoraExtraMin
        ? `Jornada de ${(minutos / 60).toFixed(1)}h excede o limite diário e a tolerância de horas extras.`
        : `Jornada de ${(minutos / 60).toFixed(1)}h gera ${Math.round(extra)}min de hora extra.`,
    );
  }
  const atrasadas = rota.paradas.filter((p) => p.atrasada);
  if (atrasadas.length) {
    alertas.push(
      `${atrasadas.length} entrega(s) com risco de atraso na janela: ${atrasadas
        .slice(0, 3)
        .map((p) => p.entrega.cliente || p.entrega.endereco.split(",")[0])
        .join(", ")}.`,
    );
  }
  return alertas;
}

/**
 * Minutos adicionais de parada obrigatória (intervalos + almoço) conforme a
 * duração de direção da rota.
 */
export function pausasObrigatoriasMin(minutosDirecao: number, regras: RegrasJornada) {
  const intervalos = Math.max(0, Math.floor(minutosDirecao / regras.maxDirecaoContinuaMin));
  const almoco = minutosDirecao > 300 ? regras.almocoMin : 0;
  return intervalos * regras.intervaloMin + almoco;
}
