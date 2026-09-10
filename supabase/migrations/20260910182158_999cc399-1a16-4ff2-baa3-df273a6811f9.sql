-- 1) Fotos de perfil: leitura restrita ao dono da pasta (ou equipe administrativa)
DROP POLICY IF EXISTS "avatars leitura autenticada" ON storage.objects;

CREATE POLICY "avatar leitura propria ou staff"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.is_staff(auth.uid())
  )
);

-- 2) Notas de manutenção: motorista só envia para veículo vinculado a ele
DROP POLICY IF EXISTS "manut nota insert" ON storage.objects;

CREATE POLICY "manut nota insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'manutencao-notas'
  AND (
    private.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.motoristas m
      WHERE m.user_id = auth.uid()
        AND m.ativo
        AND m.veiculo_id IS NOT NULL
        AND m.veiculo_id::text = split_part(name, '/', 1)
    )
  )
);