/**
 * Envio do e-mail de apresentação da G3 + registro no CRM.
 * Server-only: usado pelas server functions do Hunter / Leads pendentes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const ASSUNTO_APRESENTACAO = "Como está a entrega dos seus produtos até o cliente final?";

type Args = {
  supabase: SupabaseClient<any, any, any>;
  userId: string;
  leadId: string;
  email: string;
  nome?: string | null;
  empresa: string;
  companyId?: string | null;
};

export async function enviarApresentacaoRegistrando({
  supabase,
  userId,
  leadId,
  email,
  nome,
  empresa,
  companyId,
}: Args): Promise<{ status: string; detalhe: string | null }> {
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const primeiroNome = (nome ?? "").trim().split(/\s+/)[0] ?? "";

  let status = "enviado";
  let detalhe: string | null = null;
  try {
    const res = await sendTemplateEmail("apresentacao-g3", email, {
      templateData: { nome: primeiroNome, empresa },
      idempotencyKey: `apresentacao-g3-${leadId}-${email}`,
    });
    if (!res.sent) {
      status = "bloqueado";
      detalhe = "Destinatário está na lista de bloqueio (bounce, reclamação ou descadastro).";
    }
  } catch (e) {
    const err = e as { code?: string; status?: number; message?: string };
    status = "falhou";
    detalhe =
      err.code === "domain_not_verified"
        ? "O domínio de envio ainda não foi verificado no DNS."
        : err.status === 429
          ? "Limite de envios por hora atingido. Tente novamente em alguns minutos."
          : (err.message ?? "Falha no envio.");
  }

  await supabase.from("crm_emails_enviados").insert({
    company_id: companyId ?? null,
    lead_id: leadId,
    empresa,
    contato_nome: nome ?? null,
    destinatario: email,
    assunto: ASSUNTO_APRESENTACAO,
    template: "apresentacao-g3",
    status,
    detalhe,
    enviado_por: userId,
  });

  if (status === "enviado") {
    await supabase.from("crm_atividades").insert({
      tipo: "email",
      titulo: "E-mail de apresentação enviado",
      descricao: `Apresentação da G3 Expresso enviada para ${email}${nome ? ` (${nome})` : ""}.`,
      lead_id: leadId,
      usuario_id: userId,
      metadata: { template: "apresentacao-g3", assunto: ASSUNTO_APRESENTACAO, destinatario: email },
    });

    await supabase.from("crm_leads").update({ ultimo_contato: new Date().toISOString() }).eq("id", leadId);
  }

  return { status, detalhe };
}
