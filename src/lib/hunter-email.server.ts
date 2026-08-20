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
    await sendGoogleMail({ to: email, subject: ASSUNTO_APRESENTACAO, html, text });
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

    // Registra no funil de vendas: lead vira "contatado" com etiqueta de e-mail enviado
    const { data: leadAtual } = await supabase
      .from("crm_leads")
      .select("id, etiquetas, status, contato_nome, telefone, whatsapp, email, responsavel_id")
      .eq("id", leadId)
      .maybeSingle();

    const etiquetas: string[] = Array.isArray(leadAtual?.etiquetas) ? [...leadAtual!.etiquetas] : [];
    if (!etiquetas.includes("E-mail enviado")) etiquetas.push("E-mail enviado");

    await supabase
      .from("crm_leads")
      .update({
        ultimo_contato: new Date().toISOString(),
        status: leadAtual?.status === "aberto" || !leadAtual?.status ? "contatado" : leadAtual.status,
        etiquetas,
      })
      .eq("id", leadId);

    // Cria a oportunidade no funil (etapa Primeiro Contato) se ainda não existir
    const { data: oportExistente } = await supabase
      .from("crm_oportunidades")
      .select("id")
      .eq("lead_id", leadId)
      .limit(1)
      .maybeSingle();

    if (!oportExistente) {
      const { data: etapa } = await supabase
        .from("crm_etapas")
        .select("id")
        .eq("codigo", "primeiro_contato")
        .maybeSingle();

      if (etapa?.id) {
        await supabase.from("crm_oportunidades").insert({
          titulo: `${empresa} — prospecção por e-mail`,
          lead_id: leadId,
          contato_nome: nome ?? leadAtual?.contato_nome ?? null,
          contato_email: email,
          contato_telefone: leadAtual?.whatsapp ?? leadAtual?.telefone ?? null,
          etapa_id: etapa.id,
          origem: "Prospecção ativa",
          descricao: "Criada automaticamente pelo envio da apresentação da G3 Expresso.",
          responsavel_id: leadAtual?.responsavel_id ?? userId,
          created_by: userId,
        });
      }
    }
  }

  return { status, detalhe };
}

/**
 * Garante um lead no CRM para o e-mail informado (reaproveita se já existir)
 * e devolve o id. Usado pelo disparo individual e pelo disparo em lote.
 */
export async function garantirLead({
  supabase,
  userId,
  empresa,
  email,
  nome,
  cargo,
  telefone,
  cidade,
  segmento,
  observacoes,
}: {
  supabase: SupabaseClient<any, any, any>;
  userId: string;
  empresa: string;
  email: string;
  nome?: string | null;
  cargo?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  segmento?: string | null;
  observacoes?: string | null;
}): Promise<string> {
  const { data: existente } = await supabase
    .from("crm_leads")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (existente?.id) return existente.id as string;

  const { data: lead, error } = await supabase
    .from("crm_leads")
    .insert({
      empresa,
      contato_nome: nome ?? null,
      cargo: cargo ?? null,
      email,
      telefone: telefone ?? null,
      cidade: cidade ?? null,
      segmento: segmento ?? null,
      origem: "Prospecção ativa",
      classificacao: "C",
      prioridade: "baixa",
      status: "aberto",
      etiquetas: ["Hunter"],
      observacoes: observacoes ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return lead.id as string;
}
