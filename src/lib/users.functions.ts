import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "administrador" | "financeiro" | "gestor" | "motorista";

type CreateInput = {
  email: string;
  password: string;
  nome: string;
  telefone?: string | null;
  role: Role;
  motorista_id?: string | null;
};

type UpdateInput = {
  user_id: string;
  nome?: string;
  email?: string;
  telefone?: string | null;
  role?: Role;
  ativo?: boolean;
  // motorista vinculado: string = vincular a esse motorista; null = desvincular; undefined = não alterar
  motorista_id?: string | null;
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  // has_role vive no schema `private` (não exposto no PostgREST), então a checagem
  // é feita direto em user_roles sob RLS do próprio usuário.
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "administrador")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado");
}


async function audit(
  admin: any,
  actor: { id: string; email?: string | null },
  target_user_id: string,
  acao: string,
  detalhes: Record<string, unknown>,
) {
  await admin.from("usuarios_auditoria").insert({
    target_user_id,
    actor_user_id: actor.id,
    actor_email: actor.email ?? null,
    acao,
    detalhes,
  });
}

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CreateInput) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.role === "motorista" && !data.motorista_id) {
      throw new Error("Selecione um motorista para vincular ao usuário.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { nome: data.nome },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    await supabaseAdmin.from("profiles").update({
      nome: data.nome,
      telefone: data.telefone ?? null,
    }).eq("id", uid);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });

    if (data.role === "motorista" && data.motorista_id) {
      await supabaseAdmin.from("motoristas").update({ user_id: uid }).eq("id", data.motorista_id);
    }

    const actor = { id: context.userId, email: context.claims?.email as string | undefined };
    await audit(supabaseAdmin, actor, uid, "criar_usuario", {
      email: data.email, role: data.role, motorista_id: data.motorista_id ?? null,
    });
    return { id: uid };
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: UpdateInput) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = { id: context.userId, email: context.claims?.email as string | undefined };

    // Estado anterior
    const { data: prevProfile } = await supabaseAdmin
      .from("profiles").select("id, email, nome, telefone, ativo").eq("id", data.user_id).maybeSingle();
    if (!prevProfile) throw new Error("Usuário não encontrado");
    const { data: prevRoleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.user_id).maybeSingle();
    const prevRole = (prevRoleRow?.role as Role | undefined) ?? null;
    const { data: prevMot } = await supabaseAdmin
      .from("motoristas").select("id, nome").eq("user_id", data.user_id).maybeSingle();

    const nextRole = (data.role ?? prevRole) as Role | null;

    // Validação: motorista precisa de vínculo
    if (nextRole === "motorista") {
      const wantsLink = data.motorista_id !== undefined ? data.motorista_id : prevMot?.id ?? null;
      if (!wantsLink) throw new Error("Selecione um motorista para vincular ao usuário.");
    }

    // Atualizar profile (nome / telefone / ativo)
    const profileUpdate: {
      nome?: string; telefone?: string | null; ativo?: boolean; email?: string;
    } = {};
    if (data.nome !== undefined) profileUpdate.nome = data.nome;
    if (data.telefone !== undefined) profileUpdate.telefone = data.telefone;
    if (data.ativo !== undefined) profileUpdate.ativo = data.ativo;
    if (data.email !== undefined && data.email !== prevProfile.email) profileUpdate.email = data.email;
    if (Object.keys(profileUpdate).length) {
      const { error } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }


    // Atualizar auth (email/password fica separado; aqui só email)
    if (data.email !== undefined && data.email !== prevProfile.email) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        email: data.email, email_confirm: true,
      });
      if (error) throw new Error(error.message);
    }

    // Role
    if (data.role !== undefined && data.role !== prevRole) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });
      if (error) throw new Error(error.message);
      await audit(supabaseAdmin, actor, data.user_id, "alterar_perfil", {
        de: prevRole, para: data.role,
      });
    }

    // Vínculo motorista
    if (data.motorista_id !== undefined) {
      const currentMotoristaId = prevMot?.id ?? null;
      const target = data.motorista_id; // pode ser string ou null

      if (target !== currentMotoristaId) {
        // Remover vínculo anterior (se houver)
        if (currentMotoristaId) {
          await supabaseAdmin.from("motoristas").update({ user_id: null }).eq("id", currentMotoristaId);
          await audit(supabaseAdmin, actor, data.user_id, "desvincular_motorista", {
            motorista_id: currentMotoristaId, motorista_nome: prevMot?.nome ?? null,
          });
        }
        // Criar novo vínculo
        if (target) {
          // Garantir que motorista alvo esteja livre
          const { data: alvo } = await supabaseAdmin.from("motoristas")
            .select("id, nome, user_id, ativo").eq("id", target).maybeSingle();
          if (!alvo) throw new Error("Motorista não encontrado");
          if (alvo.user_id && alvo.user_id !== data.user_id) {
            throw new Error("Este motorista já possui um usuário vinculado.");
          }
          await supabaseAdmin.from("motoristas").update({ user_id: data.user_id }).eq("id", target);
          await audit(supabaseAdmin, actor, data.user_id, "vincular_motorista", {
            motorista_id: target, motorista_nome: alvo.nome,
          });
        }
      }
    }

    // Auditar status
    if (data.ativo !== undefined && data.ativo !== prevProfile.ativo) {
      await audit(supabaseAdmin, actor, data.user_id, data.ativo ? "ativar_usuario" : "inativar_usuario", {
        anterior: prevProfile.ativo,
      });
    }

    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; password: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    const actor = { id: context.userId, email: context.claims?.email as string | undefined };
    await audit(supabaseAdmin, actor, data.user_id, "redefinir_senha", {});
    return { ok: true };
  });

// Verificação de status para bloqueio de login (chamado após signIn)
export const checkAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles").select("ativo").eq("id", context.userId).maybeSingle();
    return { ativo: data?.ativo !== false };
  });
