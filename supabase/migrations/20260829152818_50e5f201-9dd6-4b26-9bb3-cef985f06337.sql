DROP POLICY IF EXISTS "manut nota insert" ON storage.objects;
CREATE POLICY "manut nota insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'manutencao-notas'
  AND (
    private.is_staff(auth.uid())
    OR private.current_motorista_id() IS NOT NULL
  )
);

DROP POLICY IF EXISTS "manut nota read" ON storage.objects;
CREATE POLICY "manut nota read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'manutencao-notas'
  AND (
    private.is_staff(auth.uid())
    OR owner = auth.uid()
  )
);