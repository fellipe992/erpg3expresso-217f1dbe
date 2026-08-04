DROP POLICY IF EXISTS crm_etapas_select ON public.crm_etapas;
CREATE POLICY crm_etapas_select ON public.crm_etapas FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS crm_etiquetas_select ON public.crm_etiquetas;
CREATE POLICY crm_etiquetas_select ON public.crm_etiquetas FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));