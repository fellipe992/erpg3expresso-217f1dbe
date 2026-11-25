ALTER TABLE public.viagem_paradas
  ADD COLUMN IF NOT EXISTS status_entrega text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS motivo_devolucao text,
  ADD COLUMN IF NOT EXISTS devolucao_em timestamptz,
  ADD COLUMN IF NOT EXISTS projeto_roteirizacao_id uuid REFERENCES public.roteirizacao_projetos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entrega_origem_id text;

UPDATE public.viagem_paradas
SET status_entrega = 'entregue'
WHERE entregue_em IS NOT NULL AND status_entrega = 'pendente';

CREATE INDEX IF NOT EXISTS idx_viagem_paradas_projeto_roteirizacao
  ON public.viagem_paradas (projeto_roteirizacao_id)
  WHERE projeto_roteirizacao_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.viagem_parada_devolucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  parada_id uuid NOT NULL REFERENCES public.viagem_paradas(id) ON DELETE CASCADE,
  projeto_roteirizacao_id uuid REFERENCES public.roteirizacao_projetos(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'parcial',
  item_descricao text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  unidade text DEFAULT 'UN',
  motivo text NOT NULL,
  observacoes text,
  conferido_estoque boolean NOT NULL DEFAULT false,
  conferido_em timestamptz,
  conferido_por uuid,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viagem_parada_devolucoes_viagem
  ON public.viagem_parada_devolucoes (viagem_id);

CREATE INDEX IF NOT EXISTS idx_viagem_parada_devolucoes_parada
  ON public.viagem_parada_devolucoes (parada_id);

CREATE INDEX IF NOT EXISTS idx_viagem_parada_devolucoes_projeto
  ON public.viagem_parada_devolucoes (projeto_roteirizacao_id)
  WHERE projeto_roteirizacao_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagem_parada_devolucoes TO authenticated;
GRANT ALL ON public.viagem_parada_devolucoes TO service_role;

ALTER TABLE public.viagem_parada_devolucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "devolucoes_staff_all"
  ON public.viagem_parada_devolucoes
  FOR ALL
  TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "devolucoes_motorista_select"
  ON public.viagem_parada_devolucoes
  FOR SELECT
  TO authenticated
  USING (private.is_motorista_viagem(auth.uid(), viagem_id));

CREATE POLICY "devolucoes_motorista_insert"
  ON public.viagem_parada_devolucoes
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_motorista_viagem(auth.uid(), viagem_id));

CREATE POLICY "devolucoes_motorista_update"
  ON public.viagem_parada_devolucoes
  FOR UPDATE
  TO authenticated
  USING (private.is_motorista_viagem(auth.uid(), viagem_id))
  WITH CHECK (private.is_motorista_viagem(auth.uid(), viagem_id));

CREATE POLICY "devolucoes_monitor_select"
  ON public.viagem_parada_devolucoes
  FOR SELECT
  TO authenticated
  USING (private.is_monitor(auth.uid()) OR private.is_monitor_viagem(auth.uid(), viagem_id));

DROP TRIGGER IF EXISTS trg_viagem_parada_devolucoes_updated_at ON public.viagem_parada_devolucoes;
CREATE TRIGGER trg_viagem_parada_devolucoes_updated_at
  BEFORE UPDATE ON public.viagem_parada_devolucoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();