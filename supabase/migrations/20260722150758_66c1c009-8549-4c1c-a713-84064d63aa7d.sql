DROP POLICY IF EXISTS "read motoristas" ON public.motoristas;
CREATE POLICY "read motoristas" ON public.motoristas
FOR SELECT
TO authenticated
USING (
  private.is_staff(auth.uid())
  OR user_id = auth.uid()
);