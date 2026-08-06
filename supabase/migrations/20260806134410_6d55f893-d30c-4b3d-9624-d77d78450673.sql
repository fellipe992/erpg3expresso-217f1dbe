DROP POLICY IF EXISTS crm_oport_insert ON public.crm_oportunidades;
CREATE POLICY crm_oport_insert ON public.crm_oportunidades
  FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND created_by = auth.uid());