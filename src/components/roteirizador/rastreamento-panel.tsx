import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Cenario } from "@/lib/roteirizacao/tipos";
import { brl, duracao, km, num, pct } from "@/lib/roteirizacao/format";

/**
 * Acompanhamento da execução do cenário aplicado. O progresso vem do avanço
 * informado por rota (integrável com o rastreamento em tempo real do ERP).
 */
export function RastreamentoPanel({
  cenario,
  progresso,
}: {
  cenario: Cenario;
  progresso: Record<string, number>;
}) {
  return (
    <div className="space-y-3">
      {cenario.rotas.map((r) => {
        const concluidas = Math.min(r.paradas.length, progresso[r.id] ?? 0);
        const atual = r.paradas[concluidas];
        const proxima = r.paradas[concluidas + 1];
        const perc = r.paradas.length ? concluidas / r.paradas.length : 0;
        const eta = atual ? duracao(atual.chegadaMin) : "Rota concluída";
        return (
          <Card key={r.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  Rota {r.id} · {r.veiculo.nome}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.paradas.length} entregas · {km(r.km)} · {duracao(r.minutos)} · {num(r.pesoKg)} kg ·{" "}
                  {brl(r.custo.total)}
                </p>
              </div>
              <Badge variant={perc === 1 ? "default" : "outline"}>{pct(perc)} concluído</Badge>
            </div>
            <Progress value={perc * 100} />
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Entrega atual</p>
                <p className="font-medium">
                  {atual ? atual.entrega.cliente || atual.entrega.endereco.split(",")[0] : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Próxima entrega</p>
                <p className="font-medium">
                  {proxima ? proxima.entrega.cliente || proxima.entrega.endereco.split(",")[0] : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">ETA</p>
                <p className="font-medium">{eta}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Concluídas / pendentes</p>
                <p className="font-medium">
                  {concluidas} / {r.paradas.length - concluidas}
                </p>
              </div>
            </div>
            {r.alertasJornada.length > 0 && (
              <ul className="space-y-1 rounded-md bg-muted p-2 text-xs text-muted-foreground">
                {r.alertasJornada.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
