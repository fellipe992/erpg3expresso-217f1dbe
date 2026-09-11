DROP POLICY IF EXISTS "abast comprov insert" ON storage.objects;

CREATE POLICY "abast comprov insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'abastecimento-comprovantes'
  AND (
    private.is_staff(auth.uid())
    OR (
      owner = auth.uid()
      AND split_part(name, '/', 1) = (auth.uid())::text
      AND array_length(string_to_array(name, '/'), 1) = 2
      AND split_part(name, '/', 2) <> ''
      AND private.current_motorista_id() IS NOT NULL
      AND lower(regexp_replace(name, '^.*\.', '')) IN ('jpg','jpeg','png','webp','heic','heif','pdf')
    )
  )
);