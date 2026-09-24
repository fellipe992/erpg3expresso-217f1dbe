DROP POLICY IF EXISTS "tipologias_select_auth" ON public.tipologias_veiculo;
CREATE POLICY "tipologias_select_usuarios_com_perfil" ON public.tipologias_veiculo
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Leitura company-assets restrita" ON storage.objects;
CREATE POLICY "Leitura company-assets restrita" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'company-assets'
  AND (
    private.is_staff(auth.uid())
    OR (
      (name LIKE 'logo%' OR name LIKE 'logos/%')
      AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
    )
  )
);