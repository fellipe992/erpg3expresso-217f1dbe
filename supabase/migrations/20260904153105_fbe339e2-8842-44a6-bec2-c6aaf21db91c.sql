CREATE TABLE IF NOT EXISTS public.fiscal_integracao_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  bsoft_api_token text,
  bsoft_tenant_id text,
  bsoft_api_token_homologacao text,
  bsoft_tenant_id_homologacao text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, UPDATE, INSERT, DELETE ON public.fiscal_integracao_config TO authenticated;
GRANT ALL ON public.fiscal_integracao_config TO service_role;

ALTER TABLE public.fiscal_integracao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lê integração fiscal"
  ON public.fiscal_integracao_config FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Admin edita integração fiscal"
  ON public.fiscal_integracao_config FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role));

CREATE POLICY "Admin insere integração fiscal"
  ON public.fiscal_integracao_config FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role));

INSERT INTO public.fiscal_integracao_config (singleton) VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;

CREATE TRIGGER trg_fiscal_integracao_config_updated_at
  BEFORE UPDATE ON public.fiscal_integracao_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();