import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Eye, EyeOff, Merge, Scissors, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AtribuirRota } from "@/components/roteirizador/atribuir-rota";
import { corDaRota } from "@/lib/roteirizacao/regioes";
import { ROTULO_ORIGEM } from "@/lib/roteirizacao/frota";
import { brl, duracao } from "@/lib/roteirizacao/format";
import { kg, minutosParaHora } from "@/lib/roteirizacao/parse";
import type { Plano } from "@/lib/roteirizacao/plano";
import type { Entrega } from "@/lib/roteirizacao/tipos";

type Arrasto = { entregaId: string; rotaId: string; indice: number } | null;

export function RotasPanel({
  plano,
  ocultas,
  onToggleVisibilidade,
  selecionada,
  onSelecionar,
  onMover,
  onOtimizar,
  onDividir,
  onMesclar,
  onExcluir,
  projeto,
}: {
  plano: Plano;
  ocultas: Set<string>;
  onToggleVisibilidade: (rotaId: string) => void;
  selecionada?: string | null;
  onSelecionar?: (entregaId: string) => void;
  onMover: (entregaId: string, rotaDestinoId: string, posicao?: number) => void;
  onOtimizar: (rotaId: string) => void;
  onDividir: (rotaId: string) => void;
  onMesclar: (origemId: string, destinoId: string) => void;
  onExcluir: (rotaId: string) => void;
  projeto?: string;
}) {
  const [arrasto, setArrasto] = useState<Arrasto>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const cores = useMemo(
    () => new Map(plano.rotas.map((r, i) => [r.id, corDaRota(i)])),
    [plano.rotas],
  );

  const soltar = (rotaId: string, posicao?: number) => {
    if (arrasto) onMover(arrasto.entregaId, rotaId, posicao);
    setArrasto(null);
    setAlvo(null);
  };

  if (!plano.rotas.length) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Nenhuma rota gerada ainda. Cadastre o CD e as entregas e clique em “Roteirizar”.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {plano.rotas.map((r) => {
        const cor = cores.get(r.id) ?? "#F15A24";
        const oculta = ocultas.has(r.id);
        const folga = r.veiculo.capacidadeKg - r.pesoKg;
        const porProximidade = r.paradas.filter(
          (p) =>
            p.entrega.origemAlocacao === "proximidade" ||
            p.entrega.origemAlocacao === "sobra" ||
            p.entrega.origemAlocacao === "consolidacao",
        ).length;
        return (
          <Card
            key={r.id}
            className={`overflow-hidden border-l-4 ${alvo === r.id ? "ring-2 ring-brand" : ""}`}
            style={{ borderLeftColor: cor }}
            onDragOver={(e) => {
              e.preventDefault();
              setAlvo(r.id);
            }}
            onDrop={() => soltar(r.id)}
          >
            <Collapsible defaultOpen>
              <div className="flex items-start gap-2 p-3">
                <span
                  className="mt-0.5 size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: cor }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{r.rotulo ?? r.veiculo.nome}</p>
                    <Badge variant="outline" className="text-[10px]">{r.paradas.length} paradas</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.km.toFixed(1)} km · {duracao(r.minutos)} · {brl(r.custo.total)}
                    {r.deposito ? ` · ${r.deposito.nome}` : ""}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={Math.min(100, r.ocupacaoPeso * 100)} className="h-1.5" />
                    <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
                      {(r.ocupacaoPeso * 100).toFixed(0)}% · {kg(r.pesoKg)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Peso planejado {kg(r.pesoKg)} de {kg(r.veiculo.capacidadeKg)} · folga{" "}
                    <span className={folga <= 0 ? "font-semibold text-destructive" : ""}>
                      {kg(Math.max(0, folga))}
                    </span>
                    {porProximidade > 0 ? ` · ${porProximidade} por proximidade` : ""}
                  </p>
                  {r.alertasJornada.length > 0 && (
                    <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                      {r.alertasJornada.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={oculta ? "Mostrar rota no mapa" : "Ocultar rota no mapa"}
                    onClick={() => onToggleVisibilidade(r.id)}
                  >
                    {oculta ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Expandir paradas">
                      <ChevronDown className="size-4" />
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>

              <CollapsibleContent>
                <ol className="space-y-1 px-3 pb-2">
                  {r.paradas.map((p, i) => (
                    <li
                      key={p.entrega.id}
                      draggable
                      onDragStart={() => setArrasto({ entregaId: p.entrega.id, rotaId: r.id, indice: i })}
                      onDragEnd={() => setArrasto(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.stopPropagation();
                        soltar(r.id, i);
                      }}
                      onClick={() => onSelecionar?.(p.entrega.id)}
                      className={`flex cursor-grab items-center gap-2 rounded-md border p-2 text-xs active:cursor-grabbing ${
                        selecionada === p.entrega.id ? "border-brand bg-accent" : "border-transparent hover:bg-accent/50"
                      }`}
                    >
                      <span
                        className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: cor }}
                      >
                        {p.ordem}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {p.entrega.cliente || p.entrega.endereco.split(",")[0]}
                          {p.entrega.nf ? ` · NF ${p.entrega.nf}` : ""}
                        </span>
                        <span className="block truncate text-muted-foreground">{p.entrega.endereco}</span>
                      </span>
                      {p.entrega.origemAlocacao && p.entrega.origemAlocacao !== "zona" && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[9px]"
                          title="Como esta entrega foi alocada nesta rota"
                        >
                          {ROTULO_ORIGEM[p.entrega.origemAlocacao]}
                        </Badge>
                      )}
                      <span className="shrink-0 text-right text-muted-foreground">
                        <span className={`block ${p.atrasada ? "font-semibold text-destructive" : ""}`}>
                          {minutosParaHora(p.chegadaMin)}
                        </span>
                        <span className="block">{kg(p.entrega.pesoKg)}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="flex flex-wrap gap-1 border-t border-border px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => onOtimizar(r.id)}>
                    <Sparkles className="mr-1 size-3.5" /> Otimizar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDividir(r.id)}>
                    <Scissors className="mr-1 size-3.5" /> Dividir
                  </Button>
                  {plano.rotas.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const destino = plano.rotas.find((x) => x.id !== r.id);
                        if (destino) onMesclar(r.id, destino.id);
                      }}
                    >
                      <Merge className="mr-1 size-3.5" /> Mesclar
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => onExcluir(r.id)}>
                    <Trash2 className="mr-1 size-3.5" /> Excluir
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}

      {plano.naoAtendidas.length > 0 && (
        <Card className="border-dashed p-3">
          <p className="mb-2 text-sm font-semibold text-destructive">
            Não alocadas ({plano.naoAtendidas.length})
          </p>
          <ul className="space-y-1">
            {plano.naoAtendidas.map((e: Entrega) => (
              <li
                key={e.id}
                draggable
                onDragStart={() => setArrasto({ entregaId: e.id, rotaId: "", indice: 0 })}
                className="cursor-grab truncate rounded-md border border-border p-2 text-xs"
              >
                {e.cliente || e.endereco} · {kg(e.pesoKg)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Arraste para uma rota acima para alocar manualmente.
          </p>
        </Card>
      )}
    </div>
  );
}
