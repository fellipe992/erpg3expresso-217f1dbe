/**
 * Envio do e-mail de apresentação da G3 + registro no CRM.
 * Server-only: usado pelas server functions do Hunter / Leads pendentes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import * as React from "react";
import { render } from "@react-email/render";
import { template as apresentacaoG3 } from "@/lib/email-templates/apresentacao-g3";
import { sendGoogleMail } from "@/lib/google-mail.server";

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
  const primeiroNome = (nome ?? "").trim().split(/\s+/)[0] ?? "";

  let status = "enviado";
  let detalhe: string | null = null;
  try {
    const element = React.createElement(apresentacaoG3.component, {
      nome: primeiroNome,
      empresa,
    });
    const [html, text] = await Promise.all([
      render(element),
      render(element, { plainText: true }),
    ]);
    const subject =
      typeof apresentacaoG3.subject === "function"
        ? apresentacaoG3.subject({ nome: primeiroNome, empresa })
        : apresentacaoG3.subject;
    await sendGoogleMail({ to: email, subject, html, text });
  } catch (e) {
    const err = e as { message?: string };
    status = "falhou";
    detalhe = err.message ?? "Falha no envio pelo Gmail.";
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
