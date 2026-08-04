DROP POLICY IF EXISTS crm_leads_insert ON public.crm_leads;
CREATE POLICY crm_leads_insert ON public.crm_leads FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS crm_ativ_insert ON public.crm_atividades;
CREATE POLICY crm_ativ_insert ON public.crm_atividades FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()) AND usuario_id = auth.uid());

DROP POLICY IF EXISTS crm_etiquetas_insert ON public.crm_etiquetas;
CREATE POLICY crm_etiquetas_insert ON public.crm_etiquetas FOR INSERT TO authenticated
  WITH CHECK (private.is_staff(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.marcar_atrasados() FROM authenticated, anon, PUBLIC;