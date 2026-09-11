/**
 * Envio automático de localização a cada 5 minutos.
 *
 * O rastreamento contínuo (serviço nativo no Android e `watchPosition` no
 * navegador) só grava quando o aparelho reporta movimento. Este vigia garante
 * que, com viagem em andamento, uma posição seja capturada e gravada a cada
 * 5 minutos mesmo com o caminhão parado ou o GPS oscilando — sem o motorista
 * precisar tocar em nada. O mapa do monitoramento recebe a atualização pelo
 * Realtime da tabela de localizações.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isNative } from "@/lib/native";
import { capturarEGravar, type ViagemAlvo } from "@/lib/geo";

const HEARTBEAT_MS = 5 * 60_000;
/** Não repete se já existe posição recente o suficiente. */
const RECENTE_MS = 4 * 60_000;

export function useHeartbeatGpsMotorista() {
  const { user, role } = useAuth();
  const isMotorista = role === "motorista";

  const motoristaIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!isMotorista || !user?.id) return;
    let cancelled = false;

    const viagensAtivas = async (): Promise<ViagemAlvo[]> => {
      if (!motoristaIdRef.current) {
        const { data } = await supabase
          .from("motoristas")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        motoristaIdRef.current = data?.id ?? null;
      }
      const mid = motoristaIdRef.current;
      if (!mid) return [];
      const { data } = await supabase
        .from("viagens")
        .select("id, motorista_id, veiculo_id")
        .eq("motorista_id", mid)
        .eq("status", "em_andamento");
      return (data ?? []) as ViagemAlvo[];
    };

    const bater = async () => {
      if (cancelled || busyRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      busyRef.current = true;
      try {
        const viagens = await viagensAtivas();
        if (viagens.length === 0) return;

        const { data } = await supabase
          .from("viagem_localizacoes")
          .select("created_at")
          .in(
            "viagem_id",
            viagens.map((v) => v.id),
          )
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const idade = data?.created_at
          ? Date.now() - new Date(data.created_at).getTime()
          : Number.POSITIVE_INFINITY;
        if (idade < RECENTE_MS) return;

        await capturarEGravar(viagens);
      } catch {
        /* rede instável: tenta no próximo ciclo */
      } finally {
        busyRef.current = false;
      }
    };

    void bater();
    const timer = window.setInterval(() => void bater(), HEARTBEAT_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void bater();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", () => void bater());

    let removeApp: (() => void) | undefined;
    if (isNative()) {
      void (async () => {
        try {
          const { App } = await import("@capacitor/app");
          const handle = await App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) void bater();
          });
          if (cancelled) void handle.remove();
          else removeApp = () => void handle.remove();
        } catch {
          /* noop */
        }
      })();
    }

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      removeApp?.();
    };
  }, [isMotorista, user?.id]);
}
