import { Lightbulb, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Sugestao } from "@/lib/roteirizacao/ia";

export function PainelIa({
  sugestoes,
  onAplicar,
}: {
  sugestoes: Sugestao[];
  onAplicar: (s: Sugestao) => void;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Assistente de roteirização</h3>
      </div>
      {sugestoes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhuma melhoria relevante identificada — a roteirização está equilibrada.
        </p>
      )}
      {sugestoes.map((s) => (
        <div key={s.id} className="rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.titulo}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.detalhe}</p>
            </div>
            <Badge variant={s.impacto === "alto" ? "default" : "outline"} className="shrink-0">
              {s.impacto}
            </Badge>
          </div>
          {s.acao && (
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => onAplicar(s)}>
              <Wand2 className="mr-2 h-4 w-4" /> Aplicar melhoria
            </Button>
          )}
        </div>
      ))}
    </Card>
  );
}
