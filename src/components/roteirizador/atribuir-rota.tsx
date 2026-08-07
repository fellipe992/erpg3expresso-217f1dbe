import { useMemo } from "react";
import { CheckCircle2, Truck, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMotoristasComVeiculo, type Atribuicao } from "@/hooks/use-envio-rota";
import type { Rota } from "@/lib/roteirizacao/tipos";

/**
 * Atribuição de uma rota gerada a um motorista cadastrado.
 * Aqui apenas se define quem leva a rota e a saída prevista — o envio é feito
 * de uma vez para todas as rotas pelo botão "Disparar rotas" no topo da tela,
 * o que permite reorganizar motoristas quantas vezes for necessário antes.
 */
export function AtribuirRota({
  rota,
  atribuicao,
  onChange,
  enviada,
}: {
  rota: Rota;
  atribuicao?: Atribuicao;
  onChange: (a: Atribuicao | undefined) => void;
  enviada?: string | null;
}) {
  const { data: motoristas = [], isLoading } = useMotoristasComVeiculo();
  const motoristaId = atribuicao?.motoristaId ?? "";
  const dataPrevista =
    atribuicao?.dataPrevista ?? new Date().toISOString().slice(0, 16);

  const motorista = useMemo(
    () => motoristas.find((m) => m.id === motoristaId) ?? null,
    [motoristas, motoristaId],
  );

  return (
    <div className="space-y-2 border-t border-border px-3 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Truck className="size-3.5" /> Atribuir a um motorista
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Motorista</Label>
          <div className="flex items-center gap-2">
            <Select
              value={motoristaId}
              onValueChange={(id) => onChange({ motoristaId: id, dataPrevista })}
            >
              <SelectTrigger className="h-8 flex-1 text-xs">
                <SelectValue placeholder={isLoading ? "Carregando…" : "Selecione"} />
              </SelectTrigger>
              <SelectContent>
                {motoristas.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.nome}
                    {m.placa ? ` · ${m.placa}` : " · sem veículo"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {motoristaId ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(undefined)}
                title="Remover motorista"
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Veículo vinculado</Label>
          <Input
            readOnly
            value={
              motorista
                ? [motorista.placa, [motorista.marca, motorista.modelo].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(" — ") || "sem veículo vinculado"
                : ""
            }
            placeholder="Preenchido pelo motorista"
            className="h-8 bg-muted/50 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Saída prevista</Label>
          <Input
            type="datetime-local"
            value={dataPrevista}
            onChange={(e) =>
              motoristaId
                ? onChange({ motoristaId, dataPrevista: e.target.value })
                : onChange({ motoristaId: "", dataPrevista: e.target.value })
            }
            className="h-8 text-xs"
          />
        </div>
        <div className="flex items-end text-[11px] text-muted-foreground">
          {enviada ? (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Enviada — viagem {enviada}
            </span>
          ) : motorista ? (
            <span>
              {rota.paradas.length} paradas prontas para disparo com {motorista.nome}.
            </span>
          ) : (
            <span>Selecione o motorista e use “Disparar rotas” no topo da tela.</span>
          )}
        </div>
      </div>
    </div>
  );
}
