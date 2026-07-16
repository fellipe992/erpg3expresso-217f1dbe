
CREATE POLICY "Autenticados leem company-assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'company-assets');

CREATE POLICY "Administradores enviam company-assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Administradores atualizam company-assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Administradores removem company-assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets' AND public.has_role(auth.uid(), 'administrador'));
