import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertStaff(context: Ctx) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((r: string) => ["administrador", "gestor", "financeiro"].includes(r));
  if (!ok) throw new Error("Acesso negado");
}

const TIPOS = ["cavalo", "carreta", "truck", "toco", "van", "utilitario", "vuc", "outro"] as const;

function mapTipoVeiculo(raw?: string | null) {
  const s = (raw ?? "").toLowerCase();
  const found = TIPOS.find((t) => s.includes(t));
  if (found) return found;
  if (s.includes("bitrem") || s.includes("carreta") || s.includes("semi")) return "carreta";
  if (s.includes("3/4") || s.includes("vuc")) return "vuc";
  if (s.includes("fiorino") || s.includes("utilit")) return "utilitario";
  return "outro";
}

export const aprovarParceiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; criarVeiculo?: boolean }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const supabase = (context as Ctx).supabase;

    const { data: cand, error: candErr } = await supabase
      .from("parceiros_candidaturas")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (candErr) throw new Error(candErr.message);
    if (!cand) throw new Error("Candidatura não encontrada");
    if (cand.status === "aprovado") throw new Error("Esta candidatura já foi aprovada.");

    const criarVeiculo = data.criarVeiculo !== false && !!cand.placa;
    let veiculoId: string | null = cand.veiculo_id ?? null;

    if (criarVeiculo && !veiculoId) {
      const placa = String(cand.placa).toUpperCase().replace(/\s+/g, "");
      const { data: existente } = await supabase
        .from("veiculos")
        .select("id")
        .eq("placa", placa)
        .maybeSingle();
      if (existente) {
        veiculoId = existente.id;
      } else {
        const { data: novo, error } = await supabase
          .from("veiculos")
          .insert({
            placa,
            modelo: cand.marca_modelo ?? "A definir",
            tipo: mapTipoVeiculo(cand.tipo_veiculo),
            ano: cand.ano ?? null,
            capacidade_kg: cand.capacidade_kg ?? null,
            agregado: true,
            ativo: true,
            proprietario_nome: cand.nome,
            proprietario_documento: cand.documento ?? null,
            proprietario_telefone: cand.whatsapp ?? cand.telefone ?? null,
            observacoes: [
              cand.carroceria ? `Carroceria: ${cand.carroceria}` : null,
              cand.numero_antt ? `ANTT: ${cand.numero_antt}` : null,
              "Origem: captação de parceiros (site)",
            ]
              .filter(Boolean)
              .join(" · "),
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        veiculoId = novo.id;
      }
    }

    let motoristaId: string | null = cand.motorista_id ?? null;
    if (!motoristaId) {
      const { data: novo, error } = await supabase
        .from("motoristas")
        .insert({
          nome: cand.nome,
          cpf: cand.documento ?? null,
          telefone: cand.whatsapp ?? cand.telefone ?? null,
          email: cand.email ?? null,
          cidade: cand.cidade ?? null,
          uf: cand.uf ? String(cand.uf).slice(0, 2).toUpperCase() : null,
          ativo: true,
          veiculo_id: veiculoId,
          observacoes: [
            cand.regioes ? `Regiões: ${cand.regioes}` : null,
            cand.tipos_carga ? `Cargas: ${cand.tipos_carga}` : null,
            cand.experiencia ? `Experiência: ${cand.experiencia}` : null,
            "Origem: captação de parceiros (site)",
          ]
            .filter(Boolean)
            .join(" · "),
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      motoristaId = novo.id;
    }

    const { error: updErr } = await supabase
      .from("parceiros_candidaturas")
      .update({
        status: "aprovado",
        motorista_id: motoristaId,
        veiculo_id: veiculoId,
        aprovado_por: (context as Ctx).userId,
        aprovado_em: new Date().toISOString(),
        motivo_rejeicao: null,
      })
      .eq("id", data.id);
    if (updErr) throw new Error(updErr.message);

    return { motorista_id: motoristaId, veiculo_id: veiculoId };
  });

export const rejeitarParceiro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; motivo?: string | null }) => data)
  .handler(async ({ data, context }) => {
    await assertStaff(context as Ctx);
    const { error } = await (context as Ctx).supabase
      .from("parceiros_candidaturas")
      .update({ status: "rejeitado", motivo_rejeicao: data.motivo ?? null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
