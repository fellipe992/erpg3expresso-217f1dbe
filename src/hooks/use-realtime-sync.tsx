import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Tabelas compartilhadas por vários usuários ao mesmo tempo. */
const TABELAS: { table: string; keys: string[] }[] = [
  { table: "veiculos", keys: ["veiculos", "veiculos-opt", "bi-dados"] },
  { table: "motoristas", keys: ["motoristas", "motoristas-com-veiculo", "bi-dados"] },
  { table: "clientes", keys: ["clientes", "clientes-opt", "bi-dados"] },
  { table: "fornecedores", keys: ["fornecedores", "fornecedores-opt"] },
  { table: "viagens", keys: ["viagens", "viagem", "monitoramento", "bi-dados"] },
  { table: "viagem_paradas", keys: ["viagem-paradas", "viagem"] },
  { table: "abastecimentos", keys: ["abastecimentos", "bi-dados"] },
  { table: "manutencoes", keys: ["manutencoes", "bi-dados"] },
  { table: "financeiro_lancamentos", keys: ["financeiro", "lancamentos", "bi-dados"] },
  { table: "crm_leads", keys: ["crm-leads", "crm"] },
  { table: "crm_oportunidades", keys: ["crm-oportunidades", "crm"] },
];

/**
 * Mantém os dados em sincronia quando várias pessoas usam o sistema ao mesmo
 * tempo: qualquer alteração feita por outro usuário invalida as consultas
 * correspondentes nesta sessão (com debounce para evitar rajadas).
 */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const pendentes = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      for (const key of pendentes) qc.invalidateQueries({ queryKey: [key] });
      pendentes.clear();
    };

    const agendar = (keys: string[]) => {
      keys.forEach((k) => pendentes.add(k));
      if (!timer) timer = setTimeout(flush, 800);
    };

    const channel = supabase.channel("sync-global");
    for (const { table, keys } of TABELAS) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => agendar(keys));
    }
    channel.subscribe();

    const onFocus = () => qc.invalidateQueries();
    window.addEventListener("focus", onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
