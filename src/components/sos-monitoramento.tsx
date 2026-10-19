import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Siren, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MOTIVOS = [
  "VEÍCULO ME SEGUINDO",
  "MOVIMENTO ESTRANHO NO LOCAL",
  "ABORDAGEM SUSPEITA",
  "PARADA FORÇADA / BLOQUEIO",
  "OUTRO",
];

type ViagemAtiva = { id: string; motorista_id: string | null; veiculo_id: string | null };

/**
 * Botão de atenção do motorista durante viagem ativa: pede acompanhamento
 * próximo do monitoramento. Grava um aviso para a operação e dispara
 * notificação de alta prioridade para administradores, gestores e monitores.
 * Quando a viagem termina, os pedidos abertos são resolvidos automaticamente.
 */
export function SolicitarMonitoramentoButton() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isMotorista = role === "motorista";

  // Mesma queryKey do rastreamento: reaproveita o cache, sem consulta extra.
  const { data: viagens = [] } = useQuery<ViagemAtiva[]>({
    queryKey: ["motorista-viagens-ativas", user?.id],
    enabled: !!user?.id && isMotorista,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: mData, error: mError } = await supabase
        .from("motoristas")
        .select("id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (mError) throw mError;
      if (!mData?.id) return [];
      const { data, error } = await supabase
        .from("viagens")
        .select("id, motorista_id, veiculo_id")
        .eq("motorista_id", mData.id)
        .eq("status", "em_andamento");
      if (error) throw error;
      return (data ?? []) as ViagemAtiva[];
    },
  });

  const viagem = viagens[0] ?? null;
  const semViagem = isMotorista && viagens.length === 0;

  // Pedido de monitoramento ainda aberto deste motorista (para permitir cancelar).
  const { data: pedidoAberto = null } = useQuery<{ id: string } | null>({
    queryKey: ["sos-monitoramento-aberto", user?.id],
    enabled: !!user?.id && isMotorista,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("id")
        .eq("created_by", user!.id)
        .eq("categoria", "risco_motorista")
        .neq("status", "resolvido")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const acionado = !!pedidoAberto;

  // Ao encerrar a viagem, resolve os pedidos de monitoramento ainda abertos.
  const limpandoRef = useRef(false);
  useEffect(() => {
    if (!semViagem || !user || limpandoRef.current) return;
    limpandoRef.current = true;
    void (async () => {
      await supabase.rpc("sos_encerrar", { _aviso_id: null as unknown as string });
      qc.invalidateQueries({ queryKey: ["sos-monitoramento-aberto"] });
    })();
  }, [semViagem, user, qc]);

  useEffect(() => {
    if (viagem) limpandoRef.current = false;
  }, [viagem]);

  if (!isMotorista || !viagem) return null;

  const posicaoAtual = () =>
    new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 10_000,
      });
    });

  const enviar = async () => {
    if (!user) return;
    setEnviando(true);
    try {
      const pos = await posicaoAtual();
      const lat = pos?.coords.latitude ?? null;
      const lng = pos?.coords.longitude ?? null;
      const mapaLink = lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null;

      const mensagem = [
        `MOTIVO: ${motivo}`,
        comentario.trim() ? `RELATO: ${comentario.trim().toUpperCase()}` : null,
        mapaLink ? `POSIÇÃO NO MOMENTO DO PEDIDO: ${mapaLink}` : "POSIÇÃO: acompanhar pelo rastreamento da viagem.",
        "AÇÃO: monitoramento deve acompanhar o trajeto de perto até o fim da viagem.",
      ]
        .filter(Boolean)
        .join("\n");

      const { data: aviso, error } = await supabase
        .from("avisos")
        .insert({
          assunto: `ATENÇÃO — SOLICITAÇÃO DE MONITORAMENTO (${motivo})`,
          mensagem,
          categoria: "risco_motorista",
          created_by: user.id,
          motorista_id: viagem.motorista_id,
          viagem_id: viagem.id,
          veiculo_id: viagem.veiculo_id,
          status: "aberto",
        })
        .select("id")
        .single();
      if (error) throw error;

      // Avisa a equipe de operação/monitoramento (melhor esforço: se a
      // leitura de papéis for bloqueada, o aviso na Central já garante).
      try {
        const { data: equipe } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["administrador", "gestor", "monitor"]);
        const destinos = [...new Set((equipe ?? []).map((r) => r.user_id))];
        if (destinos.length) {
          await supabase.from("notificacoes").insert(
            destinos.map((uid) => ({
              user_id: uid,
              tipo: "risco_motorista",
              titulo: `Motorista pediu monitoramento: ${motivo}`,
              mensagem: comentario.trim().toUpperCase() || "Acompanhar o trajeto de perto no monitoramento.",
              categoria: "monitoramento",
              prioridade: "alta",
              link: "/app/monitoramento",
              origem: "motorista",
              origem_id: aviso?.id ?? null,
            })),
          );
        }
      } catch {
        /* aviso na Central já registrado */
      }

      navigator.vibrate?.([200, 100, 200]);
      toast.success("Monitoramento acionado", {
        description: "A operação foi avisada e vai acompanhar seu trajeto de perto.",
        duration: 10000,
      });
      setOpen(false);
      setComentario("");
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["sos-monitoramento-aberto"] });
    } catch (e) {
      toast.error("Não foi possível acionar", { description: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  /** Motorista cancela o pedido quando a situação está controlada. */
  const cancelar = async () => {
    if (!user || !pedidoAberto) return;
    setCancelando(true);
    try {
      // Função protegida: encerra o pedido e marca lidas as notificações da equipe.
      const { data: n, error } = await supabase.rpc("sos_encerrar", { _aviso_id: pedidoAberto.id });
      if (error) throw error;
      if (!n) throw new Error("A solicitação já estava encerrada.");
      toast.success("Solicitação cancelada", {
        description: "A operação foi avisada de que a situação está controlada.",
      });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["avisos"] });
      qc.invalidateQueries({ queryKey: ["sos-monitoramento-aberto"] });
    } catch (e) {
      toast.error("Não foi possível cancelar", { description: (e as Error).message });
    } finally {
      setCancelando(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Solicitar monitoramento"
        onClick={() => setOpen(true)}
        className={cn(acionado && "animate-pulse")}
      >
        <Siren className={cn("size-5", acionado ? "text-amber-500" : "text-amber-500/70")} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar monitoramento</DialogTitle>
            <DialogDescription>
              A operação será avisada na hora e passa a acompanhar seu trajeto de perto até o fim da viagem.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>O que está acontecendo?</Label>
              <div className="grid grid-cols-1 gap-2">
                {MOTIVOS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={motivo === m ? "default" : "outline"}
                    size="sm"
                    className="justify-start"
                    onClick={() => setMotivo(m)}
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Detalhes (opcional)</Label>
              <Textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value.toUpperCase())}
                rows={3}
                placeholder="EX.: CARRO PRATA ME SEGUINDO DESDE O KM 210"
              />
            </div>
          </div>
          {acionado && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              Monitoramento acionado. A operação está acompanhando seu trajeto. Se a situação
              estiver controlada, cancele abaixo.
            </p>
          )}
          <DialogFooter className="flex-col gap-2">
            <Button onClick={enviar} disabled={enviando} className="w-full">
              {enviando && <Loader2 className="mr-2 size-4 animate-spin" />}
              {acionado ? "Enviar atualização" : "Acionar monitoramento"}
            </Button>
            {acionado && (
              <Button
                variant="outline"
                onClick={cancelar}
                disabled={cancelando}
                className="w-full"
              >
                {cancelando && <Loader2 className="mr-2 size-4 animate-spin" />}
                Situação controlada — cancelar solicitação
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
