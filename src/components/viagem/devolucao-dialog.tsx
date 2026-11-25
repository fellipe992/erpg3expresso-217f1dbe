import { useState } from "react";
import { Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { MOTIVOS_DEVOLUCAO, UNIDADES_ITEM, type ItemDevolucaoInput } from "@/lib/devolucoes";
import { cn } from "@/lib/utils";

type ParadaAlvo = {
  id: string;
  cliente: string | null;
  endereco: string;
  nf?: string | null;
  chegou_doca_em?: string | null;
  entregue_em?: string | null;
  projeto_roteirizacao_id?: string | null;
};

const itemVazio = (): ItemDevolucaoInput => ({
  item_descricao: "",
  quantidade: 1,
  unidade: "UN",
  motivo: MOTIVOS_DEVOLUCAO[0],
  observacoes: "",
});

export function DevolucaoDialog({
  open,
  onOpenChange,
  viagemId,
  parada,
  onSalvo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  viagemId: string;
  parada: ParadaAlvo | null;
  onSalvo: (tipo: "parcial" | "total") => void;
}) {
  const [tipo, setTipo] = useState<"parcial" | "total">("parcial");
  const [motivoTotal, setMotivoTotal] = useState<string>(MOTIVOS_DEVOLUCAO[0]);
  const [obsTotal, setObsTotal] = useState("");
  const [itens, setItens] = useState<ItemDevolucaoInput[]>([itemVazio()]);
  const [salvando, setSalvando] = useState(false);

  const resetar = () => {
    setTipo("parcial");
    setMotivoTotal(MOTIVOS_DEVOLUCAO[0]);
    setObsTotal("");
    setItens([itemVazio()]);
  };

  const atualizarItem = (idx: number, patch: Partial<ItemDevolucaoInput>) => {
    setItens((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const salvar = async () => {
    if (!parada) return;
    if (tipo === "parcial") {
      const invalidos = itens.some((it) => !it.item_descricao.trim() || !Number.isFinite(it.quantidade) || it.quantidade <= 0);
      if (invalidos) {
        toast.error("Informe a descrição e a quantidade válida (maior que zero) de cada item devolvido.");
        return;
      }
    }

    setSalvando(true);
    try {
      const { data: sessao } = await supabase.auth.getUser();
      const userId = sessao.user?.id ?? null;
      const agora = new Date().toISOString();

      const resumoMotivo =
        tipo === "total"
          ? motivoTotal
          : itens.map((it) => `${it.quantidade} ${it.unidade} ${it.item_descricao.trim().toUpperCase()} (${it.motivo})`).join("; ");

      const { error: errParada } = await supabase
        .from("viagem_paradas")
        .update({
          status_entrega: tipo === "total" ? "devolucao_total" : "devolucao_parcial",
          // Preserva a data original da entrega quando a devolução é registrada depois da conclusão.
          entregue_em: parada.entregue_em ?? (tipo === "parcial" ? agora : null),
          chegou_doca_em: parada.chegou_doca_em ?? agora,
          devolucao_em: agora,
          motivo_devolucao: resumoMotivo,
        })
        .eq("id", parada.id);
      if (errParada) throw errParada;

      const registros =
        tipo === "total"
          ? [
              {
                viagem_id: viagemId,
                parada_id: parada.id,
                projeto_roteirizacao_id: parada.projeto_roteirizacao_id ?? null,
                tipo: "total",
                item_descricao: parada.nf ? `CARGA TOTAL — NF ${parada.nf}` : "CARGA TOTAL",
                quantidade: 1,
                unidade: "CARGA",
                motivo: motivoTotal,
                observacoes: obsTotal.trim().toUpperCase() || null,
                registrado_por: userId,
              },
            ]
          : itens.map((it) => ({
              viagem_id: viagemId,
              parada_id: parada.id,
              projeto_roteirizacao_id: parada.projeto_roteirizacao_id ?? null,
              tipo: "parcial",
              item_descricao: it.item_descricao.trim().toUpperCase(),
              quantidade: Number(it.quantidade),
              unidade: it.unidade,
              motivo: it.motivo,
              observacoes: it.observacoes?.trim().toUpperCase() || null,
              registrado_por: userId,
            }));

      const { error: errItens } = await supabase.from("viagem_parada_devolucoes").insert(registros);
      if (errItens) throw errItens;

      toast.success(
        tipo === "total"
          ? "Devolução total registrada — entrega volta para roteirização"
          : "Devolução parcial registrada — itens enviados ao relatório de estoque",
      );
      resetar();
      onOpenChange(false);
      onSalvo(tipo);
    } catch (e) {
      toast.error("Não foi possível registrar a devolução", {
        description: e instanceof Error ? e.message : "Erro inesperado.",
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetar(); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-5 text-orange-500" />
            Registrar devolução
          </DialogTitle>
          <DialogDescription>
            {parada ? `${parada.cliente || parada.endereco}${parada.nf ? ` · NF ${parada.nf}` : ""}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={tipo === "parcial" ? "default" : "outline"}
              className={cn(tipo === "parcial" && "bg-orange-600 text-white hover:bg-orange-700")}
              onClick={() => setTipo("parcial")}
            >
              Devolução Parcial
            </Button>
            <Button
              type="button"
              variant={tipo === "total" ? "default" : "outline"}
              className={cn(tipo === "total" && "bg-red-600 text-white hover:bg-red-700")}
              onClick={() => setTipo("total")}
            >
              Devolução Total (100%)
            </Button>
          </div>

          {tipo === "total" ? (
            <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-xs text-muted-foreground">
                A carga inteira voltou. Esta entrega ficará marcada em vermelho e voltará disponível no roteirizador.
              </p>
              <div className="space-y-1.5">
                <Label>Motivo da devolução total</Label>
                <Select value={motivoTotal} onValueChange={setMotivoTotal}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOTIVOS_DEVOLUCAO.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Observações (opcional)</Label>
                <Textarea
                  value={obsTotal}
                  onChange={(e) => setObsTotal(e.target.value)}
                  placeholder="Detalhes do ocorrido no local..."
                  rows={2}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Informe os itens que voltaram. A entrega será concluída como parcial (laranja) e os produtos irão para o relatório de retorno ao estoque.
              </p>
              {itens.map((it, idx) => (
                <div key={idx} className="space-y-2 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Item {idx + 1}</span>
                    {itens.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => setItens((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Produto / Item devolvido</Label>
                    <Input
                      value={it.item_descricao}
                      onChange={(e) => atualizarItem(idx, { item_descricao: e.target.value })}
                      placeholder="Ex.: CAIXA DE LEITE INTEGRAL"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Quantidade</Label>
                      <Input
                        type="number"
                        min={0.01}
                        step="any"
                        value={it.quantidade}
                        onChange={(e) => atualizarItem(idx, { quantidade: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unidade</Label>
                      <Select value={it.unidade} onValueChange={(v) => atualizarItem(idx, { unidade: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIDADES_ITEM.map((u) => (
                            <SelectItem key={u} value={u}>{u}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Motivo</Label>
                    <Select value={it.motivo} onValueChange={(v) => atualizarItem(idx, { motivo: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIVOS_DEVOLUCAO.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setItens((prev) => [...prev, itemVazio()])}
              >
                <Plus className="mr-1.5 size-4" /> Adicionar outro item devolvido
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" />}
            Confirmar devolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}