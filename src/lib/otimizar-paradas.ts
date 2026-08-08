import { supabase } from "@/integrations/supabase/client";

/**
 * Otimiza a sequência de paradas usando a Routes API do Google
 * (`optimizeWaypointOrder`) através do backend — a chave do navegador não
 * tem permissão para roteirização, por isso a chamada é feita no servidor.
 * Retorna a nova ordem (índices do array original) e o resumo da rota.
 */
export async function otimizarParadas(params: {
  origem: string;
  destino: string;
  paradas: string[];
}): Promise<{ ordem: number[]; km: number; minutos: number }> {
  const origem = params.origem.trim();
  const destino = params.destino.trim();
  const paradas = params.paradas.map((p) => p.trim());

  if (!origem || !destino) throw new Error("Informe origem e destino para otimizar.");
  if (paradas.some((p) => !p)) throw new Error("Preencha todas as paradas antes de otimizar.");
  if (paradas.length < 2) throw new Error("Adicione pelo menos 2 paradas para otimizar.");

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente para otimizar a rota.");

  const response = await fetch("/api/otimizar-rota", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ origem, destino, paradas }),
  });

  if (!response.ok) {
    const texto = await response.text().catch(() => "");
    throw new Error(texto || "Não foi possível calcular a rota otimizada.");
  }

  return (await response.json()) as { ordem: number[]; km: number; minutos: number };
}

/** Reordena um array conforme a ordem devolvida pela otimização. */
export function aplicarOrdem<T>(itens: T[], ordem: number[]): T[] {
  const usados = new Set<number>();
  const saida: T[] = [];
  for (const i of ordem) {
    if (itens[i] !== undefined && !usados.has(i)) {
      saida.push(itens[i]);
      usados.add(i);
    }
  }
  itens.forEach((item, i) => {
    if (!usados.has(i)) saida.push(item);
  });
  return saida;
}
