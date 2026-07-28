import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CustosViagem = {
  receita: number;
  combustivel: number;
  pedagio: number;
  comissao: number;
  provisaoManutencao: number;
  provisaoPneus: number;
  outros: number;
  km: number | null;
};

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Valores em branco, zero ou inválidos são ignorados no cálculo. */
export const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function calcularProvisao(km: number | null | undefined, valorKm: unknown) {
  const k = num(km);
  const v = num(valorKm);
  return k > 0 && v > 0 ? k * v : 0;
}

export function resumoViagem(c: CustosViagem) {
  const custoTotal =
    c.combustivel + c.pedagio + c.comissao + c.provisaoManutencao + c.provisaoPneus + c.outros;
  const lucro = c.receita - custoTotal;
  const margem = c.receita > 0 ? (lucro / c.receita) * 100 : 0;
  const km = c.km && c.km > 0 ? c.km : 0;
  return {
    custoTotal,
    lucro,
    margem,
    receitaKm: km ? c.receita / km : null,
    custoKm: km ? custoTotal / km : null,
    lucroKm: km ? lucro / km : null,
  };
}

function Linha({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "negative" | "total" | "result";
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2 text-sm",
        tone === "total" && "bg-muted/50 font-semibold",
        tone === "result" && "bg-brand-subtle/50 font-semibold",
      )}
    >
      <span className={cn("text-muted-foreground", (strong || tone === "total" || tone === "result") && "text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          tone === "negative" && "text-destructive",
          (strong || tone === "total" || tone === "result") && "font-semibold",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function DemonstrativoViagem({ custos }: { custos: CustosViagem }) {
  const r = resumoViagem(custos);
  const linhas: Array<[string, number]> = [
    ["(-) Combustível", custos.combustivel],
    ["(-) Pedágios", custos.pedagio],
    ["(-) Comissão do motorista", custos.comissao],
    ["(-) Provisionamento de manutenção", custos.provisaoManutencao],
    ["(-) Provisionamento de pneus", custos.provisaoPneus],
    ["(-) Outros custos", custos.outros],
  ];

  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border/60">
        <Linha label="Receita Bruta" value={brl(custos.receita)} strong />
        {linhas.map(([label, valor]) => (
          <Linha key={label} label={label} value={brl(valor)} tone="negative" />
        ))}
        <Linha label="= Custo Operacional Total" value={brl(r.custoTotal)} tone="total" />
        <Linha
          label="Lucro da Viagem"
          value={brl(r.lucro)}
          tone="result"
        />
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-border/60 bg-border/60 md:grid-cols-4">
        <Mini label="Margem de lucro" value={`${r.margem.toFixed(1)}%`} negative={r.lucro < 0} />
        <Mini label="Receita por km" value={r.receitaKm !== null ? brl(r.receitaKm) : "—"} />
        <Mini label="Custo por km" value={r.custoKm !== null ? brl(r.custoKm) : "—"} />
        <Mini label="Lucro por km" value={r.lucroKm !== null ? brl(r.lucroKm) : "—"} negative={r.lucro < 0} />
      </div>
    </Card>
  );
}

function Mini({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="bg-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-sm font-semibold tabular-nums", negative && "text-destructive")}>
        {value}
      </div>
    </div>
  );
}
