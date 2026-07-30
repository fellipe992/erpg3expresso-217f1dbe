export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0,
  );

export const num = (v: number, casas = 0) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(Number.isFinite(v) ? v : 0);

export const pct = (v: number, casas = 0) => `${num((Number.isFinite(v) ? v : 0) * 100, casas)}%`;

export const duracao = (minutos: number) => {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
};

export const km = (v: number) => `${num(v, 0)} km`;
