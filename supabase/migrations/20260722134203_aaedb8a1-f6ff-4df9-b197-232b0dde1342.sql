
CREATE TABLE public.viagem_localizacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  motorista_id UUID REFERENCES public.motoristas(id) ON DELETE SET NULL,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  precisao NUMERIC,
  velocidade NUMERIC,
  heading NUMERIC,
  bateria NUMERIC,
  online BOOLEAN DEFAULT true,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.viagem_localizacoes TO authenticated;
GRANT ALL ON public.viagem_localizacoes TO service_role;

CREATE INDEX idx_viagem_localizacoes_viagem_created ON public.viagem_localizacoes(viagem_id, created_at DESC);
CREATE INDEX idx_viagem_localizacoes_created ON public.viagem_localizacoes(created_at DESC);

ALTER TABLE public.viagem_localizacoes ENABLE ROW LEVEL SECURITY;

-- Staff (admin/gestor/financeiro) leem tudo
CREATE POLICY "staff read localizacoes"
  ON public.viagem_localizacoes FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- Motorista lê apenas suas próprias
CREATE POLICY "motorista read own localizacoes"
  ON public.viagem_localizacoes FOR SELECT
  TO authenticated
  USING (motorista_id = public.current_motorista_id());

-- Motorista insere apenas se viagem em andamento e for sua
CREATE POLICY "motorista insert own localizacoes"
  ON public.viagem_localizacoes FOR INSERT
  TO authenticated
  WITH CHECK (
    motorista_id = public.current_motorista_id()
    AND EXISTS (
      SELECT 1 FROM public.viagens v
      WHERE v.id = viagem_id
        AND v.motorista_id = public.current_motorista_id()
        AND v.status = 'em_andamento'
    )
  );

-- Staff pode inserir/atualizar/deletar (para manutenção)
CREATE POLICY "staff manage localizacoes"
  ON public.viagem_localizacoes FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.viagem_localizacoes;
