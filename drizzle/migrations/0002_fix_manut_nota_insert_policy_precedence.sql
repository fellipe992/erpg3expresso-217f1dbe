DROP POLICY IF EXISTS "manut nota insert" ON storage.objects;
CREATE POLICY "manut nota insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'manutencao-notas'
  AND owner = auth.uid()
  AND (
    private.is_staff(auth.uid())
    OR (
      array_length(storage.foldername(name), 1) = 1
      AND length(storage.filename(name)) > 0
      AND (
        lower(right(name, 4)) IN ('.pdf', '.jpg', '.png')
        OR lower(right(name, 5)) IN ('.jpeg', '.webp')
      )
      AND EXISTS (
        SELECT 1 FROM public.motoristas m
        WHERE m.user_id = auth.uid()
          AND COALESCE(m.ativo, true)
          AND m.veiculo_id IS NOT NULL
          AND m.veiculo_id::text = split_part(name, '/', 1)
      )
    )
  )
);