CREATE TABLE public.fiscal_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('cte','mdfe')),
  status text NOT NULL DEFAULT 'rascunho',
  numero text,
  serie text,
  chave_acesso text,
  valor numeric NOT NULL DEFAULT 0,
  peso_kg numeric,
  produto_predominante text,
  motivo text,
  bsoft_id text,
  id_integracao uuid NOT NULL DEFAULT gen_random_uuid(),
  transacao_id text,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  viagem_id uuid REFERENCES public.viagens(id) ON DELETE SET NULL,
  fechamento_id uuid REFERENCES public.fechamentos(id) ON DELETE SET NULL,
  veiculo_id uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  motorista_id uuid REFERENCES public.motoristas(id) ON DELETE SET NULL,
  observacoes text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX fiscal_documentos_id_integracao_key ON public.fiscal_documentos (id_integracao);
CREATE INDEX fiscal_documentos_tipo_status_idx ON public.fiscal_documentos (tipo, status);
CREATE INDEX fiscal_documentos_viagem_idx ON public.fiscal_documentos (viagem_id);
CREATE INDEX fiscal_documentos_fechamento_idx ON public.fiscal_documentos (fechamento_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_documentos TO authenticated;
GRANT ALL ON public.fiscal_documentos TO service_role;
ALTER TABLE public.fiscal_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe interna gerencia documentos fiscais"
  ON public.fiscal_documentos FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER fiscal_documentos_updated_at
  BEFORE UPDATE ON public.fiscal_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fiscal_mdfe_ctes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mdfe_id uuid NOT NULL REFERENCES public.fiscal_documentos(id) ON DELETE CASCADE,
  cte_id uuid NOT NULL REFERENCES public.fiscal_documentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mdfe_id, cte_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_mdfe_ctes TO authenticated;
GRANT ALL ON public.fiscal_mdfe_ctes TO service_role;
ALTER TABLE public.fiscal_mdfe_ctes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipe interna gerencia vinculos de manifesto"
  ON public.fiscal_mdfe_ctes FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));