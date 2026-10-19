ALTER TABLE public.viagem_paradas ADD COLUMN IF NOT EXISTS a_caminho_em timestamptz;
COMMENT ON COLUMN public.viagem_paradas.a_caminho_em IS 'Momento em que o motorista confirmou que está indo para esta entrega.';
CREATE POLICY paradas_select_monitor ON public.viagem_paradas FOR SELECT TO authenticated
  USING (private.is_monitor(auth.uid()) OR private.is_monitor_viagem(auth.uid(), viagem_id));