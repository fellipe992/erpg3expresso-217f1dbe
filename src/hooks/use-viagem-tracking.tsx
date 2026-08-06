import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { isNative } from "@/lib/native";
import { notifyLocal } from "@/lib/notifications";
import { G3Tracking, type ViagemTracking } from "@/lib/tracking-native";

const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] as string;
const SUPABASE_KEY = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;

/** Intervalo nativo entre posições. */
const NATIVE_INTERVAL_MS = 20_000;

// -------- fallback web (navegador) --------
const WEB_MIN_INTERVAL_MS = 12_000;
const WEB_MIN_DISTANCE_M = 25;
/** Pausa após recusa por RLS (viagem já não está em andamento). */
const RLS_BACKOFF_MS = 60_000;
/** Fila local de posições capturadas sem internet. */
const QUEUE_KEY = "g3:loc-queue";
const QUEUE_MAX = 500;

function distance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * No Android (APK), o rastreamento é 100% nativo: o React apenas inicia o
 * Foreground Service quando existe viagem em andamento e o encerra quando não
 * existe mais. O serviço captura a posição pelo FusedLocationProviderClient e
 * grava direto no banco — funciona com o app minimizado, tela apagada ou o
 * motorista usando outro app.
 *
 * No navegador (ERP web), mantém-se o `watchPosition` como fallback, já que não
 * existe serviço nativo disponível ali.
 */
export function useMotoristaAutoTracking() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const isMotorista = role === "motorista";

  const { data: viagens = [] } = useQuery<ViagemTracking[]>({
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
      return (data ?? []) as ViagemTracking[];
    },
  });

  const viagensRef = useRef<ViagemTracking[]>([]);
  viagensRef.current = viagens;

  // Chave estável: só muda quando o conjunto de viagens ativas muda de fato.
  const viagensKey = viagens
    .map((v) => v.id)
    .sort()
    .join(",");

  const warnedRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ t: number; lat: number; lon: number } | null>(null);
  const insertWarnedRef = useRef(false);
  const pausedUntilRef = useRef(0);


  // ------------------------------------------------ Android: serviço nativo
  useEffect(() => {
    if (!isMotorista || !isNative()) return;

    let cancelled = false;

    (async () => {
      if (viagensKey === "") {
        try {
          await G3Tracking.stop();
        } catch {
          /* noop */
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.access_token || cancelled) return;

      const payload = {
        supabaseUrl: SUPABASE_URL,
        apiKey: SUPABASE_KEY,
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        viagens: viagensRef.current,
        intervalMs: NATIVE_INTERVAL_MS,
        minDistanceM: 0,
      };

      try {
        const { running } = await G3Tracking.isRunning();
        if (running) {
          await G3Tracking.updateSession({
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken,
            viagens: payload.viagens,
          });
        } else {
          await G3Tracking.start(payload);
        }
      } catch (e) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          toast.error("Rastreamento em segundo plano indisponível", {
            description: (e as Error).message,
          });
          void notifyLocal({
            titulo: "Rastreamento não iniciado",
            mensagem:
              "Permita a localização 'o tempo todo' e desative a otimização de bateria do app.",
            categoria: "monitoramento",
            prioridade: "alta",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isMotorista, viagensKey]);

  // Sempre que o token do Supabase é renovado com o app aberto, repassa ao
  // serviço para que ele nunca fique com credencial vencida.
  useEffect(() => {
    if (!isMotorista || !isNative()) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.access_token || viagensRef.current.length === 0) return;
      void G3Tracking.updateSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        viagens: viagensRef.current,
      }).catch(() => {});
    });
    return () => sub.subscription.unsubscribe();
  }, [isMotorista]);

  // ------------------------------------------------ Web: fallback navegador
  useEffect(() => {
    if (!isMotorista || isNative()) return;

    const stop = () => {
      if (watchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      lastSentRef.current = null;
    };

    if (viagensKey === "") {
      stop();
      return;
    }

    if (!("geolocation" in navigator)) {
      if (!warnedRef.current) {
        warnedRef.current = true;
        toast.error("Este dispositivo não suporta GPS.");
      }
      return;
    }

    type PendingRow = {
      viagem_id: string;
      motorista_id: string | null;
      veiculo_id: string | null;
      latitude: number;
      longitude: number;
      precisao: number | null;
      velocidade: number | null;
      heading: number | null;
      online: boolean;
      created_at: string;
    };

    const readQueue = (): PendingRow[] => {
      try {
        const raw = localStorage.getItem(QUEUE_KEY);
        return raw ? (JSON.parse(raw) as PendingRow[]) : [];
      } catch {
        return [];
      }
    };
    const writeQueue = (rows: PendingRow[]) => {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-QUEUE_MAX)));
      } catch {
        /* noop */
      }
    };
    const enqueue = (rows: PendingRow[]) => writeQueue([...readQueue(), ...rows]);

    /** Grava no banco. Retorna "ok" | "retry" (sem rede) | "drop" (recusado). */
    const persist = async (rows: PendingRow[]): Promise<"ok" | "retry" | "drop"> => {
      const { error } = await supabase.from("viagem_localizacoes").insert(rows);
      if (!error) return "ok";
      // RLS recusa a gravação quando a viagem já não está "em_andamento":
      // nunca vai passar em nova tentativa, então descarta.
      const rlsBlocked =
        error.code === "42501" || /row-level security/i.test(error.message ?? "");
      if (rlsBlocked) {
        pausedUntilRef.current = Date.now() + RLS_BACKOFF_MS;
        await qc.invalidateQueries({ queryKey: ["motorista-viagens-ativas"] });
        return "drop";
      }
      // Falha de rede / servidor indisponível → guarda para reenviar depois.
      const offline = !navigator.onLine || !error.code || /fetch|network/i.test(error.message ?? "");
      if (offline) return "retry";
      if (!insertWarnedRef.current) {
        insertWarnedRef.current = true;
        toast.error("GPS não foi salvo", { description: error.message });
      }
      return "drop";
    };

    /** Reenvia o que ficou pendente enquanto o dispositivo estava sem internet. */
    const flushQueue = async () => {
      if (flushingRef.current || !navigator.onLine) return;
      const pending = readQueue();
      if (pending.length === 0) return;
      flushingRef.current = true;
      try {
        // Envia em lotes para não estourar o tamanho da requisição.
        let rest = pending;
        while (rest.length > 0) {
          const batch = rest.slice(0, 100);
          const result = await persist(batch);
          if (result === "retry") break; // continua offline: mantém a fila
          rest = rest.slice(100);
          writeQueue(rest);
        }
        if (rest.length === 0) {
          writeQueue([]);
          insertWarnedRef.current = false;
          qc.invalidateQueries({ queryKey: ["monitoramento-locs"] });
          qc.invalidateQueries({ queryKey: ["rota-viagem"] });
        }
      } finally {
        flushingRef.current = false;
      }
    };

    const send = async (c: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      speed?: number | null;
      heading?: number | null;
    }) => {
      const now = Date.now();
      if (now < pausedUntilRef.current) return;
      const last = lastSentRef.current;
      const dist = last ? distance(c, { latitude: last.lat, longitude: last.lon }) : Infinity;
      const elapsed = last ? now - last.t : Infinity;
      if (elapsed < WEB_MIN_INTERVAL_MS && dist < WEB_MIN_DISTANCE_M) return;


      lastSentRef.current = { t: now, lat: c.latitude, lon: c.longitude };
      const rows: PendingRow[] = viagensRef.current.map((v) => ({
        viagem_id: v.id,
        motorista_id: v.motorista_id,
        veiculo_id: v.veiculo_id,
        latitude: c.latitude,
        longitude: c.longitude,
        precisao: c.accuracy ?? null,
        velocidade: c.speed ?? null,
        heading: c.heading ?? null,
        online: navigator.onLine,
        created_at: new Date(now).toISOString(),
      }));
      if (rows.length === 0) return;

      if (!navigator.onLine) {
        enqueue(rows);
        return;
      }

      const result = await persist(rows);
      if (result === "retry") {
        enqueue(rows);
        return;
      }
      if (result !== "ok") return;
      insertWarnedRef.current = false;
      void flushQueue();
      qc.invalidateQueries({ queryKey: ["monitoramento-locs"] });
      qc.invalidateQueries({ queryKey: ["rota-viagem"] });
    };

    // Ao voltar a rede, reenvia imediatamente as posições guardadas.
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    void flushQueue();
    const flushTimer = window.setInterval(() => void flushQueue(), 60_000);


    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) =>
        void send({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
        }),
      (err) => {
        if (!warnedRef.current) {
          warnedRef.current = true;
          toast.error("Não foi possível acessar a localização", { description: err.message });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );

    return stop;
  }, [isMotorista, viagensKey, qc]);
}
