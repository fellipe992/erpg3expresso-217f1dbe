import { CheckCircle2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Cenario, TipoCenario } from "@/lib/roteirizacao/tipos";
import { brl, duracao, km, num, pct } from "@/lib/roteirizacao/format";

export function ComparadorCenarios({
  cenarios,
  selecionado,
  onSelecionar,
  onAplicar,
}: {
  cenarios: Cenario[];
  selecionado: TipoCenario | null;
  onSelecionar: (id: TipoCenario) => void;
  onAplicar: (c: Cenario) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cenarios.map((c) => (
          <Card
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelecionar(c.id)}
            onKeyDown={(e) => e.key === "Enter" && onSelecionar(c.id)}
            className={cn(
              "cursor-pointer space-y-2 p-4 transition-colors",
              selecionado === c.id ? "border-primary ring-1 ring-primary" : "hover:border-primary/50",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold">{c.nome}</h4>
              {c.recomendado && (
                <Badge className="shrink-0 gap-1">
                  <Sparkles className="h-3 w-3" /> Recomendado
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{c.objetivo}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-xs">
              <dt className="text-muted-foreground">Veículos</dt>
              <dd className="text-right font-medium">{c.veiculos}</dd>
              <dt className="text-muted-foreground">KM</dt>
              <dd className="text-right font-medium">{km(c.km)}</dd>
              <dt className="text-muted-foreground">Tempo</dt>
              <dd className="text-right font-medium">{duracao(c.minutosOperacao)}</dd>
              <dt className="text-muted-foreground">Custo</dt>
              <dd className="text-right font-medium">{brl(c.custo)}</dd>
              <dt className="text-muted-foreground">Ocupação</dt>
              <dd className="text-right font-medium">{pct(c.ocupacaoMedia)}</dd>
            </dl>
            <div className="pt-1 text-xs text-muted-foreground">Score {c.score}/100</div>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cenário</TableHead>
              <TableHead className="text-right">Veículos</TableHead>
              <TableHead className="text-right">KM</TableHead>
              <TableHead className="text-right">Tempo</TableHead>
              <TableHead className="text-right">Custo</TableHead>
              <TableHead className="text-right">Ocupação</TableHead>
              <TableHead className="text-right">Peso</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cenarios.map((c) => (
              <TableRow key={c.id} className={cn(c.recomendado && "bg-primary/5")}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    {c.nome}
                    {c.recomendado && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </span>
                </TableCell>
                <TableCell className="text-right">{c.veiculos}</TableCell>
                <TableCell className="text-right">{km(c.km)}</TableCell>
                <TableCell className="text-right">{duracao(c.minutosOperacao)}</TableCell>
                <TableCell className="text-right">{brl(c.custo)}</TableCell>
                <TableCell className="text-right">{pct(c.ocupacaoMedia)}</TableCell>
                <TableCell className="text-right">{num(c.pesoKg)} kg</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant={c.recomendado ? "default" : "secondary"} onClick={() => onAplicar(c)}>
                    Aplicar cenário
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
