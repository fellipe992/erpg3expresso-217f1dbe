export type PrazoPagamento = "a_vista" | "semanal" | "quinzenal_imediato" | "quinzenal_casa" | "dias";

export const PRAZO_OPCOES: { value: PrazoPagamento; label: string; ajuda: string }[] = [
  { value: "a_vista", label: "À vista", ajuda: "Na data em que a viagem termina" },
  { value: "semanal", label: "Semanal", ajuda: "Segunda-feira seguinte à semana da viagem" },
  { value: "quinzenal_imediato", label: "Quinzenal imediato", ajuda: "1–15 paga dia 16 · 16–fim paga dia 1" },
  { value: "quinzenal_casa", label: "Quinzenal (uma quinzena na casa)", ajuda: "1–15 paga dia 1 do mês seguinte · 16–fim paga dia 16 do mês seguinte" },
  { value: "dias", label: "Personalizado (dias)", ajuda: "Nº de dias após o fim do período" },
];

export const prazoLabel = (p?: string | null, dias?: number | null) =>
  p === "dias" ? `${dias ?? 30} dias` : PRAZO_OPCOES.find((o) => o.value === p)?.label ?? "—";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

/** Data prevista de recebimento/pagamento a partir da data final do período (ou da viagem). */
export function calcularVencimento(regra: string | null | undefined, dataRef: string, dias?: number | null): string {
  const d = utc(dataRef);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), dia = d.getUTCDate();
  switch (regra) {
    case "a_vista":
      return iso(d);
    case "semanal": {
      const dow = d.getUTCDay(); // 0 dom
      const add = dow === 0 ? 1 : 8 - dow;
      return iso(new Date(Date.UTC(y, m, dia + add)));
    }
    case "quinzenal_imediato":
      return dia <= 15 ? iso(new Date(Date.UTC(y, m, 16))) : iso(new Date(Date.UTC(y, m + 1, 1)));
    case "quinzenal_casa":
      return dia <= 15 ? iso(new Date(Date.UTC(y, m + 1, 1))) : iso(new Date(Date.UTC(y, m + 1, 16)));
    default:
      return iso(new Date(Date.UTC(y, m, dia + (dias ?? 30))));
  }
}

/** Quinzena de referência de uma data. */
export function quinzenaDe(data: string) {
  const d = utc(data);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const q = d.getUTCDate() <= 15 ? 1 : 2;
  const de = iso(new Date(Date.UTC(y, m, q === 1 ? 1 : 16)));
  const ate = iso(q === 1 ? new Date(Date.UTC(y, m, 15)) : new Date(Date.UTC(y, m + 1, 0)));
  const mes = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
  return { q, de, ate, label: `${q}ª quinzena ${mes}` };
}

export function periodoQuinzena(mes: string /* yyyy-mm */, q: 1 | 2) {
  return quinzenaDe(`${mes}-${q === 1 ? "01" : "16"}`);
}
