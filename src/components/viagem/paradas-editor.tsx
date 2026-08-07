import { useState } from "react";
import { Loader2, MapPin, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalInput } from "@/components/planejador/local-input";
import { aplicarOrdem, otimizarParadas } from "@/lib/otimizar-paradas";

export type ParadaForm = {
  cliente: string;
  endereco: string;
  nf: string;
};

export const novaParada = (): ParadaForm => ({ cliente: "", endereco: "", nf: "" });

/**
 * Editor de destinos/entregas da viagem. As paradas informadas aqui viram o
 * roteiro que o motorista recebe (mesmo formato gerado pelo roteirizador).
 */
export function ParadasEditor({
  paradas,
  onChange,
  origem,
  destino,
}: {
  paradas: ParadaForm[];
  onChange: (paradas: ParadaForm[]) => void;
  origem?: string;
  destino?: string;
}) {
  const [otimizando, setOtimizando] = useState(false);

  const atualizar = (i: number, patch: Partial<ParadaForm>) =>
    onChange(paradas.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const otimizar = async () => {
    setOtimizando(true);
    try {
      const enderecos = paradas.map((p) => p.endereco);
      const origemRef = (origem ?? "").trim() || enderecos[0] || "";
      const destinoRef = (destino ?? "").trim() || enderecos[enderecos.length - 1] || "";
      const { ordem, km, minutos } = await otimizarParadas({
        origem: origemRef,
        destino: destinoRef,
        paradas: enderecos,
      });
      onChange(aplicarOrdem(paradas, ordem));
      toast.success("Roteiro otimizado", {
        description: `${km.toFixed(0)} km · ${Math.round(minutos)} min na melhor sequência.`,
      });
    } catch (e) {
      toast.error("Não foi possível otimizar", { description: (e as Error).message });
    } finally {
      setOtimizando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <MapPin className="size-4 text-brand" /> Endereços de entrega
          </h3>
          <p className="text-xs text-muted-foreground">
            Monta o roteiro que o motorista abre no Google Maps ao iniciar a viagem.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...paradas, novaParada()])}>
            <Plus className="mr-1 size-4" /> Adicionar endereço
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={otimizando || paradas.length < 2}
            onClick={otimizar}
          >
            {otimizando ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1 size-4" />
            )}
            Otimizar rota
          </Button>
        </div>
      </div>

      {paradas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum endereço adicionado.</p>
      ) : (
        <div className="space-y-2">
          {paradas.map((p, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-[28px_minmax(0,1fr)_150px_110px_36px] md:items-center">
              <span className="grid size-6 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <div>
                <Label className="sr-only">Endereço {i + 1}</Label>
                <LocalInput
                  value={p.endereco}
                  onChange={(v) => atualizar(i, { endereco: v })}
                  placeholder="Endereço da entrega"
                />
              </div>
              <Input
                value={p.cliente}
                onChange={(e) => atualizar(i, { cliente: e.target.value })}
                placeholder="Cliente (opcional)"
              />
              <Input
                value={p.nf}
                onChange={(e) => atualizar(i, { nf: e.target.value })}
                placeholder="NF"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remover endereço ${i + 1}`}
                onClick={() => onChange(paradas.filter((_, idx) => idx !== i))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
