/**
 * Vigia da localização no app do motorista.
 *
 * Enquanto existir viagem em andamento:
 *  - sem posição nova há mais de 5 minutos → avisa no aparelho e agenda
 *    lembretes a cada 5 minutos (funcionam com o app fechado);
 *  - sem posição há mais de 20 minutos → passa a "aguardar rede": no primeiro
 *    sinal de rede (internet voltou, app reaberto, troca de operadora/Wi-Fi) o
 *    app captura e envia a posição automaticamente;
 *  - posição voltou a chegar → cancela os lembretes.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isNative } from "@/lib/native";
import { notifyLocal } from "@/lib/notifications";
import { agendarLembretesGps, cancelarLembretesGps } from "@/lib/lembretes-gps";
import { capturarEGravar, type ViagemAlvo } from "@/lib/geo";

const CHECK_INTERVAL_MS = 60_000;
/** Sem posição por mais que isso já é considerado parado. */
const SEM_POSICAO_MS = 5 * 60_000;
/** A partir daqui o app força a captura no próximo sinal de rede. */
const CRITICO_MS = 20 * 60_000;
/** Evita repetir o aviso imediato a cada ciclo. */
const AVISO_INTERVALO_MS = 5 * 60_000;

export function useAlertaLocalizacaoMotorista() {
  const { user, role } = useAuth();
  const isMotorista = role === "motorista";

  const motoristaIdRef = useRef<string | null>(null);
  const viagensRef = useRef<ViagemAlvo[]>([]);
  const aguardandoRedeRef = useRef(false);
  const ultimoAvisoRef = useRef(0);
  /** Início da viagem em andamento mais recente (ms) — dá carência ao primeiro sinal. */
  const inicioMaisRecenteRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!isMotorista || !user?.id) return;
    let cancelled = false;

    const carregarViagens = async (): Promise<ViagemAlvo[]> => {
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
        .select("id, motorista_id, veiculo_id, data_saida")
        .eq("motorista_id", mid)
        .eq("status", "em_andamento");
      const rows = (data ?? []) as Array<ViagemAlvo & { data_saida: string | null }>;
      inicioMaisRecenteRef.current = rows.reduce<number | null>((maior, v) => {
        const t = v.data_saida ? new Date(v.data_saida).getTime() : null;
        if (t === null || Number.isNaN(t)) return maior;
        return maior === null || t > maior ? t : maior;
      }, null);
      return rows.map(({ id, motorista_id, veiculo_id }) => ({
        id,
        motorista_id,
        veiculo_id,
      })) as ViagemAlvo[];
    };

    /** Idade (ms) da última posição gravada nas viagens ativas. */
    const idadeUltimaPosicao = async (viagens: ViagemAlvo[]): Promise<number> => {
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
      if (!data?.created_at) return Number.POSITIVE_INFINITY;
      return Date.now() - new Date(data.created_at).getTime();
    };

    const verificar = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;
      try {
        const viagens = await carregarViagens();
        viagensRef.current = viagens;

        if (viagens.length === 0) {
          aguardandoRedeRef.current = false;
          await cancelarLembretesGps();
          return;
        }

        const idade = await idadeUltimaPosicao(viagens);

        if (idade <= SEM_POSICAO_MS) {
          aguardandoRedeRef.current = false;
          await cancelarLembretesGps();
          return;
        }

        // Viagem que acabou de começar: tenta pegar o primeiro ponto em
        // silêncio, sem alarmar o motorista antes da carência.
        const inicio = inicioMaisRecenteRef.current;
        const desdeInicio = inicio === null ? Number.POSITIVE_INFINITY : Date.now() - inicio;
        const referencia = Math.min(idade, desdeInicio);
        if (referencia <= SEM_POSICAO_MS) {
          aguardandoRedeRef.current = false;
          await cancelarLembretesGps();
          await capturarEGravar(viagens);
          return;
        }

        const critico = referencia > CRITICO_MS;
        aguardandoRedeRef.current = critico;

        if (Date.now() - ultimoAvisoRef.current > AVISO_INTERVALO_MS) {
          ultimoAvisoRef.current = Date.now();
          void notifyLocal({
            titulo: critico
              ? "Sem localização há mais de 20 minutos"
              : "Localização não está sendo enviada",
            mensagem:
              "Abra o app da G3 e mantenha a localização ativa para a operação acompanhar sua viagem.",
            categoria: "monitoramento",
            prioridade: "alta",
            tag: "gps-parado",
            link: "/app",
          });
        }

        await agendarLembretesGps(critico);
        // Tenta enviar agora mesmo — se houver rede e GPS, resolve na hora.
        const enviou = await capturarEGravar(viagens);
        if (enviou) {
          aguardandoRedeRef.current = false;
          ultimoAvisoRef.current = 0;
          await cancelarLembretesGps();
        }
      } catch {
        /* rede instável: tenta no próximo ciclo */
      } finally {
        busyRef.current = false;
      }
    };

    /** Chamado quando o aparelho recupera rede / o app volta ao primeiro plano. */
    const aoRecuperarRede = () => {
      if (!aguardandoRedeRef.current) {
        void verificar();
        return;
      }
      void (async () => {
        const enviou = await capturarEGravar(viagensRef.current);
        if (enviou) {
          aguardandoRedeRef.current = false;
          ultimoAvisoRef.current = 0;
          await cancelarLembretesGps();
        }
        await verificar();
      })();
    };

    void verificar();
    const timer = window.setInterval(() => void verificar(), CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") aoRecuperarRede();
    };
    window.addEventListener("online", aoRecuperarRede);
    document.addEventListener("visibilitychange", onVisible);

    // Sinal de rede do próprio Android (4G ↔ Wi-Fi, operadora voltando).
    let removeNetwork: (() => void) | undefined;
    let removeApp: (() => void) | undefined;
    if (isNative()) {
      void (async () => {
        try {
          const { Network } = await import("@capacitor/network");
          const handle = await Network.addListener("networkStatusChange", (status) => {
            if (status.connected) aoRecuperarRede();
          });
          if (cancelled) void handle.remove();
          else removeNetwork = () => void handle.remove();
        } catch {
          /* noop */
        }
      })();
      void (async () => {
        try {
          const { App } = await import("@capacitor/app");
          const handle = await App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) aoRecuperarRede();
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
      window.removeEventListener("online", aoRecuperarRede);
      document.removeEventListener("visibilitychange", onVisible);
      removeNetwork?.();
      removeApp?.();
    };
  }, [isMotorista, user?.id]);
}
