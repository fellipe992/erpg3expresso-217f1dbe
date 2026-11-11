import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** Consultas do app do motorista que dependem das viagens dele. */
const CHAVES = ["viagens", "viagem", "viagem-paradas", "motorista-dashboard"];
/** Rede de segurança caso a conexão em tempo real caia com o app aberto. */
const INTERVALO_MS = 60_000;

/**
 * Mantém as cargas do motorista atualizadas sem ele precisar trocar de tela:
 * - escuta em tempo real as viagens dele (as regras de acesso já limitam às próprias);
 * - recarrega ao voltar para o app, ao recuperar a internet e a cada minuto com a tela visível.
 */
export function useSyncMotorista() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const atualizar = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        for (const key of CHAVES) qc.invalidateQueries({ queryKey: [key] });
      }, 500);
    };

    const channel = supabase
      .channel(`motorista-viagens-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "viagens" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const codigo = (payload.new as { codigo?: string | null })?.codigo;
          toast.success(codigo ? `Nova carga recebida: OS #${codigo}` : "Nova carga recebida");
        }
        atualizar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "viagem_paradas" }, atualizar)
      .subscribe();

    const onVisivel = () => {
      if (document.visibilityState === "visible") atualizar();
    };
    document.addEventListener("visibilitychange", onVisivel);
    window.addEventListener("focus", atualizar);
    window.addEventListener("online", atualizar);

    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, INTERVALO_MS);

    // No app instalado, o retorno do segundo plano nem sempre dispara os eventos do navegador.
    let removerApp: (() => void) | null = null;
    let cancelado = false;
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) atualizar();
        });
        if (cancelado) h.remove();
        else removerApp = () => void h.remove();
      } catch {
        /* plugin indisponível nesta versão do app: os eventos do navegador cobrem */
      }
    })();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", onVisivel);
      window.removeEventListener("focus", atualizar);
      window.removeEventListener("online", atualizar);
      removerApp?.();
      supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}
