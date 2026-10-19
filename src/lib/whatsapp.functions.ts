import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EVENTOS = ["inicio_viagem", "a_caminho", "entrega_concluida", "fim_viagem", "zona_risco", "alerta_motorista", "posicao"] as const;

/** Dispara um aviso de viagem no WhatsApp (internos + monitores do cliente). */
export const avisarWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { viagemId?: string | null; evento: string; detalhe?: string | null }) =>
    z
      .object({ viagemId: z.string().uuid().nullish(), evento: z.enum(EVENTOS), detalhe: z.string().max(500).nullish() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let viagemId = data.viagemId ?? null;
    if (!viagemId) {
      const { data: m } = await supabase.from("motoristas").select("id").eq("user_id", userId).maybeSingle();
      if (!m) return { enviados: 0 };
      const { data: v } = await supabase.from("viagens").select("id").eq("motorista_id", m.id).eq("status", "em_andamento").limit(1).maybeSingle();
      viagemId = v?.id ?? null;
    }
    if (!viagemId) return { enviados: 0 };
    // RLS: só segue se quem chamou enxerga a viagem.
    const { data: ok } = await supabase.from("viagens").select("id").eq("id", viagemId).maybeSingle();
    if (!ok) throw new Error("Viagem não encontrada");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispararEvento } = await import("@/lib/whatsapp.server");
    return dispararEvento(supabaseAdmin, { viagemId, evento: data.evento, detalhe: data.detalhe ?? null, userId });
  });

/** Motorista envia mensagem pelo chat do app → WhatsApp da G3 ou do monitor. */
export const enviarChatMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { destino: "g3" | "monitor"; contatoId?: string | null; texto: string }) =>
    z
      .object({ destino: z.enum(["g3", "monitor"]), contatoId: z.string().uuid().nullish(), texto: z.string().trim().min(1).max(1000) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: m } = await supabase.from("motoristas").select("id, nome").eq("user_id", userId).maybeSingle();
    if (!m) throw new Error("Apenas motoristas usam este chat");
    const { data: v } = await supabase
      .from("viagens")
      .select("id, veiculo_id")
      .eq("motorista_id", m.id)
      .eq("status", "em_andamento")
      .limit(1)
      .maybeSingle();
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { enviarChatParaWhatsApp, normalizarTelefone } = await import("@/lib/whatsapp.server");

    let telefones: string[] = [];
    let contatoNome = "G3 EXPRESSO";
    if (data.destino === "monitor") {
      if (!data.contatoId) throw new Error("Escolha o monitor do cliente");
      // RLS: motorista só vê monitores do cliente da viagem ativa.
      const { data: c } = await supabase.from("cliente_contatos_whatsapp").select("id, nome, telefone").eq("id", data.contatoId).maybeSingle();
      if (!c) throw new Error("Monitor não disponível para esta viagem");
      telefones = [normalizarTelefone(c.telefone)];
      contatoNome = c.nome;
    } else {
      const { data: ints } = await admin.from("whatsapp_contatos_internos").select("telefone").eq("ativo", true);
      telefones = (ints ?? []).map((i) => normalizarTelefone(i.telefone));
    }
    let placa = "";
    if (v?.veiculo_id) {
      const { data: ve } = await admin.from("veiculos").select("placa").eq("id", v.veiculo_id).maybeSingle();
      placa = ve?.placa ?? "";
    }
    const quem = `${m.nome}${placa ? ` · ${placa}` : ""}`;
    const r = telefones.length
      ? await enviarChatParaWhatsApp(admin, { motoristaId: m.id, viagemId: v?.id ?? null, telefones, texto: data.texto, quem })
      : { wamid: null, erro: data.destino === "g3" ? null : "Sem número cadastrado" };
    const { error } = await admin.from("motorista_chat_mensagens").insert({
      motorista_id: m.id,
      viagem_id: v?.id ?? null,
      destino: data.destino,
      contato_id: data.destino === "monitor" ? data.contatoId ?? null : null,
      telefone: data.destino === "monitor" ? telefones[0] : null,
      contato_nome: contatoNome,
      autor: "motorista",
      autor_user_id: userId,
      texto: data.texto,
      wamid: r.wamid,
      envio_erro: r.erro,
    });
    if (error) throw new Error(error.message);
    return { ok: true, erro: r.erro };
  });

/** Equipe responde ao motorista pelo sistema (aparece no app dele). */
export const responderMotorista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { motoristaId: string; texto: string }) =>
    z.object({ motoristaId: z.string().uuid(), texto: z.string().trim().min(1).max(1000) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const staff = (roles ?? []).some((r) => ["administrador", "gestor", "monitor", "financeiro"].includes(r.role as string));
    if (!staff) throw new Error("Sem permissão");
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await admin.from("profiles").select("nome").eq("id", userId).maybeSingle();
    const { data: mot } = await admin.from("motoristas").select("user_id").eq("id", data.motoristaId).maybeSingle();
    const { error } = await admin.from("motorista_chat_mensagens").insert({
      motorista_id: data.motoristaId,
      destino: "g3",
      contato_nome: (prof as { nome?: string } | null)?.nome ?? "G3 EXPRESSO",
      autor: "equipe",
      autor_user_id: userId,
      texto: data.texto,
    });
    if (error) throw new Error(error.message);
    if (mot?.user_id) {
      await admin.from("notificacoes").insert({
        user_id: mot.user_id,
        tipo: "chat",
        titulo: "Nova mensagem da G3",
        mensagem: data.texto.slice(0, 200),
        categoria: "chat",
        prioridade: "alta",
        link: "/app/chat",
        origem: "operacao",
      });
    }
    return { ok: true };
  });
