DROP POLICY IF EXISTS "read manutencoes" ON public.manutencoes;

CREATE POLICY "read manutencoes" ON public.manutencoes
FOR SELECT TO authenticated
USING (
  private.is_staff(auth.uid())
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.motoristas m
    WHERE m.user_id = auth.uid()
      AND m.id = manutencoes.motorista_id
  )
);

REVOKE EXECUTE ON FUNCTION public.marcar_atrasados() FROM PUBLIC, anon, authenticated;