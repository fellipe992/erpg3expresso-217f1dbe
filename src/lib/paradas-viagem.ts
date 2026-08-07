import { supabase } from "@/integrations/supabase/client";
import type { ParadaForm } from "@/components/viagem/paradas-editor";

/** Substitui as paradas de uma viagem pela lista informada (na ordem da tela). */
export async function sincronizarParadas(viagemId: string, paradas: ParadaForm[]) {
  const validas = paradas.filter((p) => p.endereco.trim());
  const { error: erroDelete } = await supabase.from("viagem_paradas").delete().eq("viagem_id", viagemId);
  if (erroDelete) throw erroDelete;
  if (!validas.length) return;
  const { error } = await supabase.from("viagem_paradas").insert(
    validas.map((p, i) => ({
      viagem_id: viagemId,
      ordem: i + 1,
      endereco: p.endereco.trim(),
      cliente: p.cliente.trim() || null,
      nf: p.nf.trim() || null,
    })),
  );
  if (error) throw error;
}
