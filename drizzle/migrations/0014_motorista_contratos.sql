ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS cnpj_empresa text,
  ADD COLUMN IF NOT EXISTS razao_social text,
  ADD COLUMN IF NOT EXISTS rntrc text;

CREATE TABLE public.motorista_contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  versao text NOT NULL DEFAULT 'v1',
  cnpj text NOT NULL,
  razao_social text NOT NULL,
  rntrc text NOT NULL,
  dados_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  assinatura_path text NOT NULL,
  pdf_path text NOT NULL,
  assinado_em timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  status text NOT NULL DEFAULT 'assinado',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.motorista_contratos TO authenticated;
GRANT ALL ON public.motorista_contratos TO service_role;
ALTER TABLE public.motorista_contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY mc_select ON public.motorista_contratos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_staff(auth.uid()));
CREATE POLICY mc_insert ON public.motorista_contratos FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.motoristas m WHERE m.id = motorista_id AND m.user_id = auth.uid()));
CREATE POLICY mc_update_staff ON public.motorista_contratos FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- Motorista atualiza só os dados da empresa no próprio cadastro
CREATE OR REPLACE FUNCTION public.motorista_salvar_empresa(_cnpj text, _razao text, _rntrc text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.motoristas SET cnpj_empresa = _cnpj, razao_social = upper(_razao), rntrc = _rntrc
  WHERE user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.motorista_salvar_empresa(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.motorista_salvar_empresa(text,text,text) TO authenticated;

CREATE POLICY contratos_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contratos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY contratos_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contratos' AND ((storage.foldername(name))[1] = auth.uid()::text OR private.is_staff(auth.uid())));