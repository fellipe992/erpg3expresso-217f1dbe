
-- 1) Revoke EXECUTE on get_primary_role from authenticated/anon/public
REVOKE EXECUTE ON FUNCTION public.get_primary_role(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_primary_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_primary_role(uuid) FROM authenticated;

-- 2) Tighten abastecimento-comprovantes storage policies
DROP POLICY IF EXISTS "abast comprov insert" ON storage.objects;
DROP POLICY IF EXISTS "abast comprov read" ON storage.objects;
DROP POLICY IF EXISTS "abast comprov update" ON storage.objects;

-- INSERT: only staff, or motorista uploading under their own folder (path prefix = auth.uid())
CREATE POLICY "abast comprov insert" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'abastecimento-comprovantes'
    AND (
      public.is_staff(auth.uid())
      OR (
        owner = auth.uid()
        AND split_part(name, '/', 1) = auth.uid()::text
      )
    )
  );

-- SELECT: staff, or motorista reading a receipt attached to their own abastecimento record
CREATE POLICY "abast comprov read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'abastecimento-comprovantes'
    AND (
      public.is_staff(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.abastecimentos a
        WHERE a.comprovante_path = storage.objects.name
          AND a.motorista_id = public.current_motorista_id()
      )
    )
  );

-- UPDATE: same rule as SELECT, plus owner check to prevent takeover
CREATE POLICY "abast comprov update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'abastecimento-comprovantes'
    AND (
      public.is_staff(auth.uid())
      OR (
        owner = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.abastecimentos a
          WHERE a.comprovante_path = storage.objects.name
            AND a.motorista_id = public.current_motorista_id()
        )
      )
    )
  );
