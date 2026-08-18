-- Backfill: leads que já receberam a apresentação viram "contatado" com etiqueta e oportunidade no funil
UPDATE public.crm_leads l
SET status = CASE WHEN l.status = 'aberto' THEN 'contatado' ELSE l.status END,
    etiquetas = CASE WHEN 'E-mail enviado' = ANY(l.etiquetas) THEN l.etiquetas ELSE array_append(l.etiquetas, 'E-mail enviado') END,
    updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM public.crm_emails_enviados e
  WHERE e.lead_id = l.id AND e.status = 'enviado'
);

INSERT INTO public.crm_oportunidades (titulo, lead_id, contato_nome, contato_email, contato_telefone, etapa_id, origem, descricao, responsavel_id, created_by)
SELECT l.empresa || ' — prospecção por e-mail', l.id, l.contato_nome, l.email,
       COALESCE(l.whatsapp, l.telefone),
       (SELECT id FROM public.crm_etapas WHERE codigo = 'primeiro_contato' LIMIT 1),
       'Prospecção ativa',
       'Criada automaticamente pelo envio da apresentação da G3 Expresso.',
       l.responsavel_id, l.created_by
FROM public.crm_leads l
WHERE EXISTS (SELECT 1 FROM public.crm_emails_enviados e WHERE e.lead_id = l.id AND e.status = 'enviado')
  AND NOT EXISTS (SELECT 1 FROM public.crm_oportunidades o WHERE o.lead_id = l.id);