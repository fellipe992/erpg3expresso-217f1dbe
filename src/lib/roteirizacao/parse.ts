/** Converte texto pt-BR (1.234,567) ou en (1234.567) em número decimal. */
export function parseDecimal(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const bruto = String(v).trim();
  if (!bruto) return null;
  const limpo = bruto.replace(/[^\d.,-]/g, "");
  if (!limpo) return null;
  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");
  let normalizado = limpo;
  if (temVirgula && temPonto) {
    normalizado = limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo.replace(/,/g, "");
  } else if (temVirgula) {
    normalizado = limpo.replace(",", ".");
  }
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza "8", "8:0", "0800", "08h30" para "HH:MM". Retorna null se inválido. */
export function normalizarHora(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  const bruto = String(v).trim().replace("h", ":").replace(/\s/g, "");
  const m = bruto.match(/^(\d{1,2}):?(\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Minutos desde o início da jornada (padrão 08:00) até o horário informado. */
export function horaParaMinutos(hora: string | null | undefined, inicioJornada = "08:00"): number | undefined {
  const alvo = normalizarHora(hora);
  const inicio = normalizarHora(inicioJornada) ?? "08:00";
  if (!alvo) return undefined;
  const [ah, am] = alvo.split(":").map(Number);
  const [ih, im] = inicio.split(":").map(Number);
  return ah * 60 + am - (ih * 60 + im);
}

/** Converte minutos desde o início da jornada em horário do relógio. */
export function minutosParaHora(minutos: number, inicioJornada = "08:00") {
  const inicio = normalizarHora(inicioJornada) ?? "08:00";
  const [ih, im] = inicio.split(":").map(Number);
  const total = Math.max(0, Math.round(ih * 60 + im + minutos));
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export const kg = (v: number) =>
  `${(Number.isFinite(v) ? v : 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
