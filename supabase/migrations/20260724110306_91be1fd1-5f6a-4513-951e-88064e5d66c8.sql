-- 1) Restringir INSERT em viagem_auditoria a staff ou motorista dono da viagem.
-- Triggers SECURITY DEFINER continuam funcionando (bypassam RLS).
DROP POLICY IF EXISTS "auth insert viagem_auditoria" ON public.viagem_auditoria;
DROP POLICY IF EXISTS "authenticated insert viagem_auditoria" ON public.viagem_auditoria;
DROP POLICY IF EXISTS "viagem_auditoria_insert_authenticated" ON public.viagem_auditoria;

CREATE POLICY "viagem_auditoria_insert_staff_or_owner"
ON public.viagem_auditoria
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.viagens v
    JOIN public.motoristas m ON m.id = v.motorista_id
    WHERE v.id = viagem_auditoria.viagem_id
      AND m.user_id = auth.uid()
  )
);