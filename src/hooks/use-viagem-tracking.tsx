import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

type ActiveViagem = {
  id: string;
  motorista_id: string | null;
  veiculo_id: string | null;
};

// Distância aproximada em metros (Haversine).
function distance(a: GeolocationCoordinates, b: { latitude: number; longitude: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const MIN_INTERVAL_MS = 12_000;
const MIN_DISTANCE_M = 25;

/**
 * Ativa o compartilhamento de localização enquanto o motorista tiver
 * viagens em andamento. Só age quando o usuário é motorista.
 */
export function useMotoristaAutoTracking() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isMotorista = role === "motorista";

  const { data: viagens = [] } = useQuery<ActiveViagem[]>({
    queryKey: ["motorista-viagens-ativas", user?.id],
    enabled: !!user?.id && isMotorista,
    refetchInterval: 30_000,
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
      return (data ?? []) as ActiveViagem[];
    },
  });

  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ t: number; lat: number; lon: number } | null>(null);
  const batteryRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const insertWarnedRef = useRef(false);

  useEffect(() => {
    if (!isMotorista) return;
    // Bateria (opcional).
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    nav
      .getBattery?.()
      .then((b) => {
        batteryRef.current = Math.round(b.level * 100);
      })
      .catch(() => {
        /* noop */
      });
  }, [isMotorista]);

  useEffect(() => {
    if (!isMotorista) return;
    if (viagens.length === 0) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        lastSentRef.current = null;
      }
      return;
    }

    if (!("geolocation" in navigator)) {
      if (!warnedRef.current) {
        toast.error("Este dispositivo não suporta GPS.");
        warnedRef.current = true;
      }
      return;
    }

    if (watchIdRef.current !== null) return;

    const send = async (pos: GeolocationPosition) => {
      const now = Date.now();
      const c = pos.coords;
      const last = lastSentRef.current;
      const dist = last ? distance(c, { latitude: last.lat, longitude: last.lon }) : Infinity;
      const elapsed = last ? now - last.t : Infinity;
      if (elapsed < MIN_INTERVAL_MS && dist < MIN_DISTANCE_M) return;

      lastSentRef.current = { t: now, lat: c.latitude, lon: c.longitude };
      const rows = viagens.map((v) => ({
        viagem_id: v.id,
        motorista_id: v.motorista_id,
        veiculo_id: v.veiculo_id,
        latitude: c.latitude,
        longitude: c.longitude,
        precisao: c.accuracy ?? null,
        velocidade: c.speed ?? null,
        heading: c.heading ?? null,
        bateria: batteryRef.current,
        online: navigator.onLine,
      }));
      const { error } = await supabase.from("viagem_localizacoes").insert(rows);
      if (error) {
        if (!insertWarnedRef.current) {
          toast.error("GPS não foi salvo", { description: error.message });
          insertWarnedRef.current = true;
        }
        return;
      }
      insertWarnedRef.current = false;
      qc.invalidateQueries({ queryKey: ["monitoramento-locs"] });
      qc.invalidateQueries({ queryKey: ["rota-viagem"] });
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void send(pos);
      },
      () => {
        /* o watchPosition abaixo mostrará o erro com detalhes se persistir */
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        void send(pos);
      },
      (err) => {
        if (!warnedRef.current) {
          toast.error("Não foi possível acessar a localização", { description: err.message });
          warnedRef.current = true;
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );

    // Heartbeat de no máximo 5 minutos — garante posição registrada mesmo parado.
    const heartbeat = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // força envio ignorando o filtro de distância/intervalo
          lastSentRef.current = null;
          void send(pos);
        },
        () => {
          /* noop */
        },
        { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
      );
    }, 5 * 60_000);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      clearInterval(heartbeat);
    };
  }, [isMotorista, viagens, qc]);
}
