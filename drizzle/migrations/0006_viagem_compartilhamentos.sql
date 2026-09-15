CREATE TABLE public.viagem_compartilhamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogado_em TIMESTAMPTZ
);

CREATE INDEX idx_viagem_compart_token ON public.viagem_compartilhamentos(token);
CREATE INDEX idx_viagem_compart_viagem ON public.viagem_compartilhamentos(viagem_id);

GRANT SELECT, INSERT, UPDATE ON public.viagem_compartilhamentos TO authenticated;
GRANT ALL ON public.viagem_compartilhamentos TO service_role;

ALTER TABLE public.viagem_compartilhamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compart staff ve" ON public.viagem_compartilhamentos
  FOR SELECT TO authenticated
  USING (
    private.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.viagens v
      WHERE v.id = viagem_compartilhamentos.viagem_id
        AND private.is_monitor_cliente(auth.uid(), v.cliente_id)
    )
  );

CREATE POLICY "compart cria" ON public.viagem_compartilhamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      private.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.viagens v
        WHERE v.id = viagem_compartilhamentos.viagem_id
          AND private.is_monitor_cliente(auth.uid(), v.cliente_id)
      )
    )
  );

CREATE POLICY "compart revoga" ON public.viagem_compartilhamentos
  FOR UPDATE TO authenticated
  USING (
    private.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.viagens v
      WHERE v.id = viagem_compartilhamentos.viagem_id
        AND private.is_monitor_cliente(auth.uid(), v.cliente_id)
    )
  )
  WITH CHECK (
    private.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.viagens v
      WHERE v.id = viagem_compartilhamentos.viagem_id
        AND private.is_monitor_cliente(auth.uid(), v.cliente_id)
    )
  );