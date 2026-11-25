import { supabase } from "@/integrations/supabase/client";
import type { ParadaForm } from "@/components/viagem/paradas-editor";

/** Substitui as paradas de uma viagem pela lista informada (na ordem da tela). */
export async function sincronizarParadas(viagemId: string, paradas: ParadaForm[]) {
  const validas = paradas.filter((p) => p.endereco.trim());

  // Busca os IDs atuais para preservar status de entrega, devoluções e vínculo com o roteirizador.
  const { data: atuais, error: erroAtuais } = await supabase
    .from("viagem_paradas")
    .select("id")
    .eq("viagem_id", viagemId);
  if (erroAtuais) throw erroAtuais;

  const idsAtuais = new Set((atuais ?? []).map((r) => r.id));
  const idsMantidos = new Set(validas.map((p) => p.id).filter((id): id is string => Boolean(id && idsAtuais.has(id))));
  const idsRemover = [...idsAtuais].filter((id) => !idsMantidos.has(id));

  if (idsRemover.length) {
    const { error: erroDelete } = await supabase.from("viagem_paradas").delete().in("id", idsRemover);
    if (erroDelete) throw erroDelete;
  }

  const novas: Array<{ viagem_id: string; ordem: number; endereco: string; cliente: string | null; nf: string | null }> = [];

  for (let i = 0; i < validas.length; i++) {
    const p = validas[i]!;
    const campos = {
      ordem: i + 1,
      endereco: p.endereco.trim(),
      cliente: p.cliente.trim() || null,
      nf: p.nf.trim() || null,
    };
    if (p.id && idsAtuais.has(p.id)) {
      const { error } = await supabase.from("viagem_paradas").update(campos).eq("id", p.id);
      if (error) throw error;
    } else {
      novas.push({ viagem_id: viagemId, ...campos });
    }
  }

  if (novas.length) {
    const { error } = await supabase.from("viagem_paradas").insert(novas);
    if (error) throw error;
  }
}
