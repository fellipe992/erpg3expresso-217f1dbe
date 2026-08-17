CREATE TABLE public.parceiros_candidaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  documento text,
  telefone text,
  whatsapp text,
  email text,
  cidade text,
  uf text,
  tipo_veiculo text,
  marca_modelo text,
  ano integer,
  placa text,
  capacidade_kg numeric,
  carroceria text,
  tem_antt boolean,
  numero_antt text,
  regioes text,
  tipos_carga text,
  experiencia text,
  sobre text,
  origem text NOT NULL DEFAULT 'site',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','rejeitado')),
  motivo_rejeicao text,
  motorista_id uuid REFERENCES public.motoristas(id) ON DELETE SET NULL,
  veiculo_id uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX parceiros_candidaturas_status_idx ON public.parceiros_candidaturas (status, created_at DESC);

GRANT SELECT, UPDATE ON public.parceiros_candidaturas TO authenticated;
GRANT ALL ON public.parceiros_candidaturas TO service_role;

ALTER TABLE public.parceiros_candidaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read parceiros" ON public.parceiros_candidaturas
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "staff update parceiros" ON public.parceiros_candidaturas
  FOR UPDATE TO authenticated USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "admin delete parceiros" ON public.parceiros_candidaturas
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'administrador'::app_role));

CREATE TRIGGER parceiros_candidaturas_updated_at
  BEFORE UPDATE ON public.parceiros_candidaturas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();