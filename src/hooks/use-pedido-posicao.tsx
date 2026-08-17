import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isNative } from "@/lib/native";
import { notifyLocal } from "@/lib/notifications";
import {
  CATEGORIA_PEDIDO_POSICAO,
  listarPedidosAbertos,
  responderPedido,
  type PedidoPosicao,
} from "@/lib/pedido-posicao";

const HANDLED_KEY = "g3:pedidos-posicao-atendidos";
/** Verificação de segurança: mesmo sem realtime, confere a cada 60 s. */
const CHECK_INTERVAL_MS = 60_000;

function readHandled(): string[] {
  try {
    const raw = localStorage.getItem(HANDLED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markHandled(id: string) {
  try {
    const next = [...readHandled(), id].slice(-100);
    localStorage.setItem(HANDLED_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

async function capturarPosicao(): Promise<GeolocationCoordinates | null> {
  if (isNative()) {
    try {
      const { Geolocation } = await import("@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 25_000,
      });
      return pos.coords as unknown as GeolocationCoordinates;
    } catch {
      return null;
    }
  }
  if (!("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 25_000 },
    );
  });
}

/** Evita repetir a confirmação de abertura em recargas seguidas. */
const CONFIRMA_ABERTURA_MS = 2 * 60_000;

/**
 * App do motorista: escuta pedidos de posição da operação em tempo real
 * (com conferência periódica de 60 s), captura o GPS na hora, grava o ponto,
 * responde o pedido e avisa o motorista por notificação no aparelho.
 *
 * Além disso, ao abrir o app (e ao voltar ao primeiro plano) o app confirma a
 * posição atual das viagens em andamento — assim o botão "Centralizar" da
 * operação nunca falha por falta de dados.
 */
export function usePedidoPosicaoMotorista() {
  const { user, role } = useAuth();
  const isMotorista = role === "motorista";
  const motoristaIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const ultimaConfirmacaoRef = useRef(0);

  useEffect(() => {
    if (!isMotorista || !user?.id) return;
    let cancelled = false;

    /** Grava um ponto imediato para cada viagem em andamento. */
    const confirmarPosicaoAbertura = async () => {
      if (cancelled) return;
      if (Date.now() - ultimaConfirmacaoRef.current < CONFIRMA_ABERTURA_MS) return;
      const mid = motoristaIdRef.current;
      if (!mid) return;

      const { data: viagens } = await supabase
        .from("viagens")
        .select("id, motorista_id, veiculo_id")
        .eq("motorista_id", mid)
        .eq("status", "em_andamento");
      if (cancelled || !viagens?.length) return;

      const coords = await capturarPosicao();
      if (cancelled || !coords) return;
      ultimaConfirmacaoRef.current = Date.now();

      await supabase.from("viagem_localizacoes").insert(
        viagens.map((v) => ({
          viagem_id: v.id,
          motorista_id: v.motorista_id,
          veiculo_id: v.veiculo_id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          precisao: coords.accuracy ?? null,
          velocidade: coords.speed ?? null,
          heading: coords.heading ?? null,
          online: typeof navigator !== "undefined" ? navigator.onLine : true,
        })),
      );
    };




    const atender = async (pedido: PedidoPosicao) => {
      if (readHandled().includes(pedido.id)) return;
      markHandled(pedido.id);

      const coords = await capturarPosicao();
      if (!coords) {
        void responderPedido(
          pedido.id,
          "Não foi possível obter o GPS agora (sinal ou permissão de localização).",
        );
        return;
      }
      if (pedido.viagem_id) {
        await supabase.from("viagem_localizacoes").insert({
          viagem_id: pedido.viagem_id,
          motorista_id: pedido.motorista_id,
          veiculo_id: pedido.veiculo_id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          precisao: coords.accuracy ?? null,
          velocidade: coords.speed ?? null,
          heading: coords.heading ?? null,
          online: typeof navigator !== "undefined" ? navigator.onLine : true,
        });
      }
      await responderPedido(pedido.id, "Posição atual enviada à operação.");
      void notifyLocal({
        titulo: "Posição enviada",
        mensagem: "A operação solicitou sua localização e ela foi enviada.",
        categoria: "monitoramento",
        prioridade: "alta",
        tag: `pedido-${pedido.id}`,
      });
    };

    const verificar = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;
      try {
        if (!motoristaIdRef.current) {
          const { data } = await supabase
            .from("motoristas")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          motoristaIdRef.current = data?.id ?? null;
        }
        const mid = motoristaIdRef.current;
        if (!mid) return;
        const pedidos = await listarPedidosAbertos(mid);
        for (const p of pedidos) {
          if (cancelled) break;
          await atender(p);
        }
      } catch {
        /* rede instável: tenta no próximo ciclo */
      } finally {
        busyRef.current = false;
      }
    };

    void (async () => {
      await verificar();
      await confirmarPosicaoAbertura().catch(() => undefined);
    })();
    const timer = window.setInterval(() => void verificar(), CHECK_INTERVAL_MS);


    const channel = supabase
      .channel("pedidos-posicao-motorista")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "avisos" },
        (payload) => {
          const row = payload.new as { categoria?: string; motorista_id?: string | null };
          if (row.categoria !== CATEGORIA_PEDIDO_POSICAO) return;
          if (motoristaIdRef.current && row.motorista_id !== motoristaIdRef.current) return;
          void verificar();
        },
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") void verificar();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      supabase.removeChannel(channel);
    };
  }, [isMotorista, user?.id]);
}
