import { useMemo, useState } from "react";
import { Loader2, Send, Truck } from "lucide-react";
import { toast } from "sonner";

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
import {
  enviarRotaParaMotorista,
  useMotoristasComVeiculo,
} from "@/hooks/use-envio-rota";
import type { Rota } from "@/lib/roteirizacao/tipos";

/**
 * Atribuição de uma rota gerada a um motorista cadastrado.
 * Ao escolher o motorista, placa e modelo do veículo vinculado são preenchidos.
 * "Enviar rota" cria uma viagem planejada com todas as paradas — o motorista
 * recebe a notificação e pode iniciar a viagem pelo aplicativo.
 */
export function AtribuirRota({
  rota,
  rotulo,
  projeto,
}: {
  rota: Rota;
  rotulo: string;
  projeto?: string;
}) {
  const { data: motoristas = [], isLoading } = useMotoristasComVeiculo();
  const [motoristaId, setMotoristaId] = useState<string>("");
  const [data, setData] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState<string | null>(null);

  const motorista = useMemo(
    () => motoristas.find((m) => m.id === motoristaId) ?? null,
    [motoristas, motoristaId],
  );

  const enviar = async () => {
    if (!motorista) return toast.error("Selecione o motorista");
    if (!motorista.veiculo_id) {
      return toast.error("Motorista sem veículo vinculado", {
        description: "Vincule um veículo ao motorista no cadastro antes de enviar a rota.",
      });
    }
    setEnviando(true);
    try {
      const r = await enviarRotaParaMotorista({
        rota,
        rotuloRota: rotulo,
        motorista,
        dataPrevista: data,
        projeto,
      });
      setEnviada(r.codigo ?? r.viagemId);
      toast.success(`Rota enviada para ${motorista.nome}`, {
        description: `Viagem ${r.codigo ?? ""} agendada com ${rota.paradas.length} paradas.`,
      });
    } catch (e) {
      toast.error("Não foi possível enviar a rota", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-border px-3 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Truck className="size-3.5" /> Atribuir a um motorista
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Motorista</Label>
          <Select value={motoristaId} onValueChange={setMotoristaId}>
            <SelectTrigger className="h-8 text-xs">
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
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex items-end">
          <Button size="sm" className="w-full" onClick={enviar} disabled={enviando || !motoristaId}>
            {enviando ? (
              <Loader2 className="mr-2 size-3.5 animate-spin" />
            ) : (
              <Send className="mr-2 size-3.5" />
            )}
            Enviar rota
          </Button>
        </div>
      </div>
      {enviada && (
        <p className="text-[11px] text-muted-foreground">
          Viagem <span className="font-semibold">{enviada}</span> agendada — o motorista foi
          notificado e pode iniciá-la pelo aplicativo.
        </p>
      )}
    </div>
  );
}
