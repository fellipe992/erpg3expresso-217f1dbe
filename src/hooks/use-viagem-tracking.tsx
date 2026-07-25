import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { registerPlugin } from "@capacitor/core";
import type {
  BackgroundGeolocationPlugin,
  Location as BgLocation,
  CallbackError as BgCallbackError,
} from "@capacitor-community/background-geolocation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { isNative } from "@/lib/native";

const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");


type ActiveViagem = {
  id: string;
  motorista_id: string | null;
  veiculo_id: string | null;
};

// Distância aproximada em metros (Haversine).
function distance(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
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
const HEARTBEAT_MS = 10 * 60_000; // 10 minutos garantidos

type Coords = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
};

/**
 * Ativa o compartilhamento de localização enquanto o motorista tiver
 * viagens em andamento. No Android (Capacitor), usa o plugin de
 * background-geolocation para continuar rastreando com o app minimizado,
 * tela apagada ou celular bloqueado. No web, usa navigator.geolocation.
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
  const bgWatcherIdRef = useRef<string | null>(null);
  const lastSentRef = useRef<{ t: number; lat: number; lon: number } | null>(null);
  const batteryRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const insertWarnedRef = useRef(false);
  const viagensRef = useRef<ActiveViagem[]>([]);
  viagensRef.current = viagens;

  useEffect(() => {
    if (!isMotorista) return;
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    nav
      .getBattery?.()
      .then((b) => {
        batteryRef.current = Math.round(b.level * 100);
      })
      .catch(() => {});
  }, [isMotorista]);

  useEffect(() => {
    if (!isMotorista) return;

    // Nada a fazer se não há viagens ativas → limpa quaisquer watchers.
    const stop = async () => {
      if (watchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (bgWatcherIdRef.current) {
        try {
          await BackgroundGeolocation.removeWatcher({ id: bgWatcherIdRef.current });
        } catch {
          /* noop */
        }
        bgWatcherIdRef.current = null;
      }

      lastSentRef.current = null;
    };

    if (viagens.length === 0) {
      void stop();
      return;
    }

    const send = async (c: Coords, { force = false }: { force?: boolean } = {}) => {
      const now = Date.now();
      const last = lastSentRef.current;
      const dist = last ? distance(c, { latitude: last.lat, longitude: last.lon }) : Infinity;
      const elapsed = last ? now - last.t : Infinity;
      if (!force && elapsed < MIN_INTERVAL_MS && dist < MIN_DISTANCE_M) return;

      lastSentRef.current = { t: now, lat: c.latitude, lon: c.longitude };
      const rows = viagensRef.current.map((v) => ({
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
      if (rows.length === 0) return;
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

    let disposed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    (async () => {
      if (isNative()) {
        // -------- Android nativo: rastreamento em background --------
        try {
          const id = await BackgroundGeolocation.addWatcher(
            {
              backgroundMessage:
                "G3 Motorista está registrando sua viagem em andamento.",
              backgroundTitle: "Viagem em andamento",
              requestPermissions: true,
              stale: false,
              distanceFilter: 20,
            },
            (location: BgLocation | undefined, error: BgCallbackError | undefined) => {
              if (error) {
                if (error.code === "NOT_AUTHORIZED") {
                  if (!warnedRef.current) {
                    toast.error("Permissão de localização negada", {
                      description:
                        "Habilite a localização em 2º plano nas configurações do Android.",
                    });
                    warnedRef.current = true;
                  }
                }
                return;
              }
              if (!location) return;
              void send({
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                speed: location.speed ?? null,
                heading: location.bearing ?? null,
              });
            },
          );

          if (disposed) {
            try {
              await BackgroundGeolocation.removeWatcher({ id });
            } catch {
              /* noop */
            }
            return;
          }
          bgWatcherIdRef.current = id;
        } catch (e) {
          if (!warnedRef.current) {
            toast.error("Rastreamento em background indisponível", {
              description: (e as Error).message,
            });
            warnedRef.current = true;
          }
        }
      } else {
        // -------- Web: watchPosition padrão --------
        if (!("geolocation" in navigator)) {
          if (!warnedRef.current) {
            toast.error("Este dispositivo não suporta GPS.");
            warnedRef.current = true;
          }
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            void send({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed,
              heading: pos.coords.heading,
            }),
          () => {},
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
        );
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
              toast.error("Não foi possível acessar a localização", {
                description: err.message,
              });
              warnedRef.current = true;
            }
          },
          { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
        );
      }

      // Heartbeat de 5 min — garante ponto no banco mesmo parado, tanto no web quanto no Android.
      heartbeat = setInterval(async () => {
        if (viagensRef.current.length === 0) return;
        try {
          if (isNative()) {
            const { Geolocation } = await import("@capacitor/geolocation");
            const pos = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 15_000,
              maximumAge: 60_000,
            });
            await send(
              {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                speed: pos.coords.speed ?? null,
                heading: pos.coords.heading ?? null,
              },
              { force: true },
            );
          } else {
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                void send(
                  {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    speed: pos.coords.speed,
                    heading: pos.coords.heading,
                  },
                  { force: true },
                ),
              () => {},
              { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
            );
          }
        } catch {
          /* noop */
        }
      }, HEARTBEAT_MS);
    })();

    return () => {
      disposed = true;
      if (heartbeat) clearInterval(heartbeat);
      void stop();
    };
  }, [isMotorista, viagens, qc]);
}
