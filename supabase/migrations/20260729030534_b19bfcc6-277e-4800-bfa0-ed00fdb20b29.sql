CREATE TABLE public.simulacoes_viagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text,
  origem text NOT NULL,
  destino text NOT NULL,
  paradas jsonb NOT NULL DEFAULT '[]'::jsonb,
  tipo_veiculo text NOT NULL DEFAULT 'caminhao',
  eixos integer NOT NULL DEFAULT 6,
  tipo_rota text NOT NULL DEFAULT 'eficiente',
  consumo_km_l numeric,
  preco_combustivel numeric,
  distancia_km numeric,
  duracao_min numeric,
  litros numeric,
  custo_combustivel numeric,
  custo_pedagios numeric,
  valor_frete numeric,
  comissao_percentual numeric,
  comissao_valor numeric,
  provisao_manutencao_km numeric,
  provisao_pneus_km numeric,
  custo_total numeric,
  lucro numeric,
  margem numeric,
  polyline text,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  motorista_id uuid REFERENCES public.motoristas(id) ON DELETE SET NULL,
  veiculo_id uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  reboque_id uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  viagem_id uuid REFERENCES public.viagens(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulacoes_viagem TO authenticated;
GRANT ALL ON public.simulacoes_viagem TO service_role;

ALTER TABLE public.simulacoes_viagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff gerencia simulacoes"
ON public.simulacoes_viagem FOR ALL TO authenticated
USING (private.is_staff(auth.uid()))
WITH CHECK (private.is_staff(auth.uid()));

CREATE TRIGGER trg_simulacoes_viagem_updated_at
BEFORE UPDATE ON public.simulacoes_viagem
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_simulacoes_viagem_created_at ON public.simulacoes_viagem (created_at DESC);