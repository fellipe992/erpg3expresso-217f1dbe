CREATE TABLE public.crm_emails_enviados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  empresa TEXT NOT NULL,
  contato_nome TEXT,
  destinatario TEXT NOT NULL,
  assunto TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT 'apresentacao-g3',
  status TEXT NOT NULL DEFAULT 'enviado',
  detalhe TEXT,
  enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX crm_emails_enviados_created_at_idx ON public.crm_emails_enviados (created_at DESC);
CREATE INDEX crm_emails_enviados_destinatario_idx ON public.crm_emails_enviados (destinatario);

GRANT SELECT, INSERT ON public.crm_emails_enviados TO authenticated;
GRANT ALL ON public.crm_emails_enviados TO service_role;

ALTER TABLE public.crm_emails_enviados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_le_emails_enviados" ON public.crm_emails_enviados
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "staff_registra_emails_enviados" ON public.crm_emails_enviados
  FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()) AND enviado_por = auth.uid());