-- Permite que a equipe interna (staff) gerencie a foto de perfil de outros usuários
CREATE POLICY "avatar staff insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND private.is_staff(auth.uid()));

CREATE POLICY "avatar staff update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND private.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'avatars' AND private.is_staff(auth.uid()));

CREATE POLICY "avatar staff delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND private.is_staff(auth.uid()));