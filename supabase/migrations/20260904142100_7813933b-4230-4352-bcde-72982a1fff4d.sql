CREATE TABLE public.fiscal_ciots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor text NOT NULL DEFAULT 'manual' CHECK (provedor IN ('bsoft','gestora','manual')),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','processando','emitido','rejeitado','cancelado','encerrado')),
  numero_ciot text,
  protocolo text,
  tipo_contratado text NOT NULL DEFAULT 'TAC' CHECK (tipo_contratado IN ('TAC','ETC','CTC')),
  contratado_nome text NOT NULL,
  contratado_documento text NOT NULL,
  contratado_rntrc text,
  valor_frete numeric NOT NULL DEFAULT 0,
  valor_adiantamento numeric NOT NULL DEFAULT 0,
  valor_quitacao numeric NOT NULL DEFAULT 0,
  distancia_km numeric,
  data_emissao date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  viagem_id uuid REFERENCES public.viagens(id) ON DELETE SET NULL,
  mdfe_id uuid REFERENCES public.fiscal_documentos(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  motorista_id uuid REFERENCES public.motoristas(id) ON DELETE SET NULL,
  veiculo_id uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  motivo text,
  observacoes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_ciots TO authenticated;
GRANT ALL ON public.fiscal_ciots TO service_role;

ALTER TABLE public.fiscal_ciots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe interna gerencia ciots"
  ON public.fiscal_ciots FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER fiscal_ciots_updated_at
  BEFORE UPDATE ON public.fiscal_ciots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_fiscal_ciots_viagem ON public.fiscal_ciots(viagem_id);
CREATE INDEX idx_fiscal_ciots_mdfe ON public.fiscal_ciots(mdfe_id);
CREATE INDEX idx_fiscal_ciots_status ON public.fiscal_ciots(status);

ALTER TABLE public.fiscal_documentos ADD COLUMN IF NOT EXISTS ciot text;