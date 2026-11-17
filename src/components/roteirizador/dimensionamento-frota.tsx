import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dimensionarFrota } from "@/lib/roteirizacao/dimensionamento";
import { brl, num } from "@/lib/roteirizacao/format";
import type { Rota } from "@/lib/roteirizacao/tipos";

export function DimensionamentoFrota({ rotas, naoAtendidas = 0 }: { rotas: Rota[]; naoAtendidas?: number }) {
  const linhas = dimensionarFrota(rotas);
  if (!linhas.length) return null;
  const tot = linhas.reduce(
    (a, l) => ({ v: a.v + l.veiculos, n: a.n + l.notas, p: a.p + l.pesoMedioKg * l.veiculos, c: a.c + l.custo }),
    { v: 0, n: 0, p: 0, c: 0 },
  );
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="font-semibold">Dimensionamento da frota</h3>
        <p className="text-xs text-muted-foreground">Quantos veículos de cada tipo a operação precisa neste cenário.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border text-left">
              <th className="py-1 pr-2">Veículo</th>
              <th className="py-1 pr-2 text-right">Qtd.</th>
              <th className="py-1 pr-2 text-right">Notas/veíc. (méd · máx)</th>
              <th className="py-1 pr-2 text-right">Peso médio</th>
              <th className="py-1 pr-2 text-right">Ocupação</th>
              <th className="py-1 pr-2 text-right">Custo</th>
              <th className="py-1">Limitado por</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.categoria} className="border-b border-border/60">
                <td className="py-1.5 pr-2 font-medium">{l.nome}</td>
                <td className="py-1.5 pr-2 text-right font-semibold">{l.veiculos}</td>
                <td className="py-1.5 pr-2 text-right">{num(Math.round(l.notasMedia))} · {l.notasMax}</td>
                <td className="py-1.5 pr-2 text-right">{num(Math.round(l.pesoMedioKg))} kg</td>
                <td className="py-1.5 pr-2 text-right">{Math.round(l.ocupacaoMedia * 100)}%</td>
                <td className="py-1.5 pr-2 text-right">{brl(l.custo)}</td>
                <td className="py-1.5 space-x-1">
                  {l.limitadoPorPeso > 0 && <Badge variant="outline">Peso: {l.limitadoPorPeso}</Badge>}
                  {l.limitadoPorNotas > 0 && <Badge variant="secondary">Notas: {l.limitadoPorNotas}</Badge>}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5 pr-2">Total</td>
              <td className="py-1.5 pr-2 text-right">{tot.v}</td>
              <td className="py-1.5 pr-2 text-right">{num(tot.n)} notas</td>
              <td className="py-1.5 pr-2 text-right">{num(Math.round(tot.p))} kg</td>
              <td />
              <td className="py-1.5 pr-2 text-right">{brl(tot.c)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {naoAtendidas > 0 && (
        <p className="mt-2 text-xs text-destructive">
          {naoAtendidas} entrega(s) ficaram sem veículo. Ligue o "Modo cotação" em Frota e Custos para ver a frota total necessária.
        </p>
      )}
    </Card>
  );
}
