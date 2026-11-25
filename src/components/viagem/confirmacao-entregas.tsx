import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MapPin, PackageCheck, RotateCcw, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DevolucaoDialog } from "@/components/viagem/devolucao-dialog";
import type { StatusEntrega } from "@/lib/devolucoes";
import { cn } from "@/lib/utils";

type Parada = {
  id: string;
  ordem: number;
  cliente: string | null;
  endereco: string;
  nf: string | null;
  chegou_doca_em: string | null;
  entregue_em: string | null;
  a_caminho_em: string | null;
  status_entrega: StatusEntrega;
  motivo_devolucao: string | null;
  devolucao_em: string | null;
  projeto_roteirizacao_id: string | null;
};

const nome = (p: Parada) => p.cliente || p.endereco;
const hora = (d: string) =>
  new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/**
 * Confirmação de entrega pelo motorista: "Cheguei no cliente" → "Descarga
 * concluída" → escolhe e confirma o próximo cliente (mesmo fora do roteiro).
 * O monitoramento lê esses horários para mostrar finalizadas e próximo destino.
 */
export function ConfirmacaoEntregasCard({ viagemId }: { viagemId: string }) {
  const qc = useQueryClient();
  const [escolher, setEscolher] = useState(false);
  const [paradaDevolucao, setParadaDevolucao] = useState<Parada | null>(null);
  const [salvando, setSalvando] = useState(false);
  const key = ["confirmacao-entregas", viagemId];

  const { data: paradas = [] } = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Parada[]> => {
      const { data, error } = await supabase
        .from("viagem_paradas")
        .select("id, ordem, cliente, endereco, nf, chegou_doca_em, entregue_em, a_caminho_em, status_entrega, motivo_devolucao, devolucao_em, projeto_roteirizacao_id")
        .eq("viagem_id", viagemId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Parada[];
    },
  });

  if (!paradas.length) return null;

  const pendentes = paradas.filter((p) => p.status_entrega === "pendente" && !p.entregue_em);
  const atual = pendentes.find((p) => p.a_caminho_em || p.chegou_doca_em) ?? null;
  const feitas = paradas.length - pendentes.length;

  const atualizar = async (id: string, campos: Partial<Parada>, msg: string) => {
    setSalvando(true);
    const { data, error } = await supabase.from("viagem_paradas").update(campos).eq("id", id).select("id");
    setSalvando(false);
    if (error || !data?.length) {
      toast.error("Não foi possível registrar", { description: error?.message ?? "Sem permissão." });
      return false;
    }
    toast.success(msg);
    qc.invalidateQueries({ queryKey: key });
    return true;
  };

  const agora = () => new Date().toISOString();

  const concluirDescarga = async () => {
    if (!atual) return;
    const ok = await atualizar(
      atual.id,
      { status_entrega: "entregue", entregue_em: agora(), chegou_doca_em: atual.chegou_doca_em ?? agora() },
      "Entrega finalizada",
    );

    if (ok && pendentes.length > 1) setEscolher(true);
  };

  const irPara = async (p: Parada) => {
    // Só um destino "a caminho" por vez: limpa o anterior se o motorista mudou de ideia.
    const outros = pendentes.filter((x) => x.id !== p.id && x.a_caminho_em && !x.chegou_doca_em);
    for (const o of outros) await supabase.from("viagem_paradas").update({ a_caminho_em: null }).eq("id", o.id);
    const ok = await atualizar(p.id, { a_caminho_em: agora() }, `Indo para ${nome(p)}`);

    if (ok) setEscolher(false);
  };

  const sugerido = pendentes[0];

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">Entregas</h2>
        <span className="text-sm text-muted-foreground">
          {feitas}/{paradas.length} finalizadas
        </span>
      </div>

      {pendentes.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-medium text-green-600">
          <CheckCircle2 className="size-5" /> Todas as entregas foram finalizadas.
        </p>
      ) : atual ? (
        <div className="space-y-3 rounded-lg border-2 border-brand/50 p-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {atual.chegou_doca_em ? `No cliente desde ${hora(atual.chegou_doca_em)}` : "Destino atual"}
          </p>
          <p className="font-semibold">{nome(atual)}</p>
          {atual.cliente && <p className="text-xs text-muted-foreground">{atual.endereco}</p>}
          {!atual.chegou_doca_em ? (
            <Button
              className="h-14 w-full text-base font-bold"
              disabled={salvando}
              onClick={() => atualizar(atual.id, { chegou_doca_em: agora() }, "Chegada registrada")}
            >
              {salvando ? <Loader2 className="mr-2 size-5 animate-spin" /> : <MapPin className="mr-2 size-5" />}
              CHEGUEI NO CLIENTE
            </Button>
          ) : (
            <div className="space-y-2">
              <Button className="h-14 w-full text-base font-bold" disabled={salvando} onClick={concluirDescarga}>
                {salvando ? <Loader2 className="mr-2 size-5 animate-spin" /> : <PackageCheck className="mr-2 size-5" />}
                DESCARGA CONCLUÍDA — PRÓXIMA ENTREGA
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full border-orange-500/50 text-orange-600 hover:bg-orange-500/10 hover:text-orange-700"
                disabled={salvando}
                onClick={() => setParadaDevolucao(atual)}
              >
                <RotateCcw className="mr-2 size-4" />
                INFORMAR DEVOLUÇÃO (PARCIAL OU TOTAL)
              </Button>
            </div>
          )}
          {!atual.chegou_doca_em && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setEscolher(true)}>
              Vou para outro cliente
            </Button>
          )}
        </div>
      ) : (
        <Button className="h-14 w-full text-base font-bold" onClick={() => setEscolher(true)}>
          <Truck className="mr-2 size-5" /> {feitas === 0 ? "INICIANDO TRAJETO — ESCOLHER DESTINO" : "IR PARA A PRÓXIMA ENTREGA"}
        </Button>
      )}

      <ul className="space-y-1.5 text-sm">
        {paradas.map((p) => {
          const st = p.status_entrega;
          const concluida = st === "entregue" || (st === "pendente" && Boolean(p.entregue_em));
          const parcial = st === "devolucao_parcial";
          const total = st === "devolucao_total";
          const pendente = !concluida && !parcial && !total;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/50 px-2 py-1.5">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  concluida && "bg-emerald-500",
                  parcial && "bg-orange-500",
                  total && "bg-red-500",
                  pendente && "bg-muted-foreground/30",
                )}
              />
              <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{p.ordem}</span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-medium", concluida && "text-muted-foreground line-through")}>
                  {nome(p)}
                </p>
                {p.motivo_devolucao && (
                  <p className="truncate text-[11px] text-muted-foreground">{p.motivo_devolucao}</p>
                )}
              </div>
              {concluida && (
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600">
                    Entregue {p.entregue_em ? hora(p.entregue_em) : ""}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-orange-600 hover:bg-orange-500/10"
                    disabled={salvando}
                    onClick={() => setParadaDevolucao(p)}
                  >
                    Devolução
                  </Button>
                </div>
              )}
              {parcial && (
                <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-600">
                  Dev. parcial
                </Badge>
              )}
              {total && (
                <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-[10px] text-red-600">
                  Dev. total
                </Badge>
              )}
              {pendente && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-emerald-600 hover:bg-emerald-500/10"
                    disabled={salvando}
                    onClick={() =>
                      atualizar(
                        p.id,
                        { status_entrega: "entregue", entregue_em: agora(), chegou_doca_em: p.chegou_doca_em ?? agora() },
                        "Entrega concluída",
                      )
                    }
                  >
                    Concluir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-orange-600 hover:bg-orange-500/10"
                    disabled={salvando}
                    onClick={() => setParadaDevolucao(p)}
                  >
                    Devolução
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={escolher} onOpenChange={setEscolher}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{feitas === 0 ? "Iniciando trajeto — qual é o primeiro cliente?" : "Para qual cliente você está indo?"}</DialogTitle>
            <DialogDescription>
              {feitas === 0
                ? "Confirme o primeiro destino da viagem. Se não for o primeiro do roteiro, escolha o cliente certo."
                : "Confirme o próximo destino. Se não for o próximo do roteiro, escolha o cliente certo."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {pendentes
              .filter((p) => !p.chegou_doca_em)
              .map((p) => (
                <Button
                  key={p.id}
                  variant={p.id === sugerido?.id ? "default" : "outline"}
                  className="h-auto w-full flex-col items-start whitespace-normal py-3 text-left"
                  disabled={salvando}
                  onClick={() => irPara(p)}
                >
                  <span className="font-semibold">
                    {p.ordem}. {nome(p)} {p.id === sugerido?.id && (feitas === 0 ? "· primeiro do roteiro" : "· próximo do roteiro")}
                  </span>
                  {p.cliente && <span className="text-xs opacity-80">{p.endereco}</span>}
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      <DevolucaoDialog
        open={Boolean(paradaDevolucao)}
        onOpenChange={(v) => { if (!v) setParadaDevolucao(null); }}
        viagemId={viagemId}
        parada={paradaDevolucao}
        onSalvo={() => {
          qc.invalidateQueries({ queryKey: key });
          qc.invalidateQueries({ queryKey: ["roteirizador-paradas"] });
          qc.invalidateQueries({ queryKey: ["roteirizador-devolucoes"] });
          if (pendentes.length > 1) setEscolher(true);
        }}
      />
    </Card>
  );
}
