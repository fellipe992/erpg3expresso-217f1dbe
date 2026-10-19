import { useEffect, useRef, useState } from "react";
import { ShieldAlert, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useZonasRisco, zonaNoPonto, NIVEIS, TIPOS_RISCO } from "@/lib/zonas-risco";
import { buscarSugestoesEndereco, detalhesEndereco, localizarCoordenadas, novoSessionToken, type SugestaoLocal } from "@/lib/places";
import { cn } from "@/lib/utils";

const INTERVALO_MS = 2 * 60_000;
const AVISO_A_M = 2000;

/** Avisa o motorista ao se aproximar de zona laranja/vermelha. Cálculo local, sem custo. */
export function useAlertaZonaRisco() {
  const { data: zonas = [] } = useZonasRisco();
  const avisadas = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!zonas.length || typeof navigator === "undefined" || !navigator.geolocation) return;
    const checar = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const z = zonaNoPonto(
            zonas.filter((x) => x.nivel >= 3),
            p,
            AVISO_A_M,
          );
          if (!z) return;
          const ultimo = avisadas.current.get(z.id) ?? 0;
          if (Date.now() - ultimo < 60 * 60_000) return;
          avisadas.current.set(z.id, Date.now());
          navigator.vibrate?.([300, 150, 300]);
          toast.warning(`Zona de risco ${NIVEIS[z.nivel].label.toLowerCase()} próxima`, {
            description: `${z.nome}. ${z.recomendacao ?? "Evite paradas."}`,
            duration: 20000,
          });
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 20_000 },
      );
    };
    checar();
    const t = setInterval(checar, INTERVALO_MS);
    return () => clearInterval(t);
  }, [zonas]);
}

export function ReportarRiscoButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [bairro, setBairro] = useState("");
  const [tipo, setTipo] = useState("roubo");
  const [nivel, setNivel] = useState(3);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  const posicaoAtual = () =>
    new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 15_000,
      });
    });

  const enviar = async () => {
    if (!user) return;
    setEnviando(true);
    try {
      const pos = await posicaoAtual();
      if (!pos && !bairro.trim()) {
        toast.error("Sem GPS: informe o bairro ou trecho.");
        return;
      }
      const { error } = await supabase.from("zonas_risco_reportes").insert({
        user_id: user.id,
        lat: pos?.coords.latitude ?? null,
        lng: pos?.coords.longitude ?? null,
        bairro: bairro.trim().toUpperCase() || null,
        tipo,
        nivel_sugerido: nivel,
        comentario: comentario.trim().toUpperCase() || null,
      });
      if (error) throw error;
      toast.success("Obrigado! A operação vai validar a zona.");
      setOpen(false);
      setBairro("");
      setComentario("");
    } catch (e) {
      toast.error("Não foi possível enviar", { description: (e as Error).message });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        aria-label="Reportar zona de risco"
        onClick={() => setOpen(true)}
        className="h-14 flex-1 gap-2 border-2 border-destructive/60 bg-background text-sm font-bold text-destructive shadow-lg"
      >
        <ShieldAlert className="size-6" />
        ZONA DE RISCO
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reportar zona de risco</DialogTitle>
            <DialogDescription>
              Usamos sua posição atual. A operação valida antes de entrar no mapa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Bairro ou trecho (opcional)</Label>
              <Input value={bairro} onChange={(e) => setBairro(e.target.value.toUpperCase())} placeholder="EX.: BR-116 KM 230" />
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(TIPOS_RISCO).map(([k, v]) => (
                  <Button key={k} type="button" variant={tipo === k ? "default" : "outline"} size="sm" onClick={() => setTipo(k)}>
                    {v}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nível percebido</Label>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNivel(n)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-2 text-sm",
                      nivel === n ? "border-foreground" : "border-border/60",
                    )}
                  >
                    <span className="size-3 rounded-full" style={{ background: NIVEIS[n].cor }} />
                    {NIVEIS[n].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>O que aconteceu?</Label>
              <Textarea value={comentario} onChange={(e) => setComentario(e.target.value.toUpperCase())} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={enviar} disabled={enviando} className="w-full">
              {enviando && <Loader2 className="mr-2 size-4 animate-spin" />}
              Enviar para validação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
