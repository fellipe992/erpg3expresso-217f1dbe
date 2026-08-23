import { ensureMotoristaFolder } from "@/lib/onedrive.server";

type Ctx = { supabase: any; userId: string };

const STAFF = ["administrador", "gestor", "financeiro"];

async function roles(context: Ctx) {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { role: string }[]).map((r) => r.role);
}

export async function assertStaffOneDrive(context: Ctx) {
  const rs = await roles(context);
  if (!rs.some((r) => STAFF.includes(r))) throw new Error("Acesso negado");
}

/**
 * Staff pode informar o motorista; motorista só acessa a própria pasta.
 * A pasta é criada na hora se ainda não existir.
 */
export async function resolverPastaMotorista(context: Ctx, motoristaId?: string) {
  const rs = await roles(context);
  const isStaff = rs.some((r) => STAFF.includes(r));
  const q = context.supabase.from("motoristas").select("id, nome");
  const { data, error } = isStaff && motoristaId
    ? await q.eq("id", motoristaId).maybeSingle()
    : await q.eq("user_id", context.userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Motorista não encontrado");
  const r = await ensureMotoristaFolder((data as { nome: string }).nome);
  return r.pasta;
}
