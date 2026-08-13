DROP POLICY IF EXISTS "Motorista exclui fotos de viagem em aberto" ON storage.objects;
CREATE POLICY "Motorista exclui fotos de viagem em aberto" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'viagem-fotos'
  AND EXISTS (
    SELECT 1 FROM public.viagens v
    WHERE v.id::text = split_part(objects.name, '/', 1)
      AND v.motorista_id = private.current_motorista_id()
      AND v.status = ANY (ARRAY['planejada'::viagem_status, 'em_andamento'::viagem_status])
  )
);

DROP POLICY IF EXISTS "abast comprov insert" ON storage.objects;
CREATE POLICY "abast comprov insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'abastecimento-comprovantes'
  AND (
    private.is_staff(auth.uid())
    OR (owner = auth.uid() AND split_part(name, '/', 1) = auth.uid()::text)
  )
);

DROP POLICY IF EXISTS "abast comprov read" ON storage.objects;
CREATE POLICY "abast comprov read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'abastecimento-comprovantes'
  AND (
    private.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.abastecimentos a
      WHERE a.comprovante_path = objects.name
        AND a.motorista_id = private.current_motorista_id()
    )
  )
);

DROP POLICY IF EXISTS "abast comprov update" ON storage.objects;
CREATE POLICY "abast comprov update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'abastecimento-comprovantes'
  AND (
    private.is_staff(auth.uid())
    OR (owner = auth.uid() AND EXISTS (
      SELECT 1 FROM public.abastecimentos a
      WHERE a.comprovante_path = objects.name
        AND a.motorista_id = private.current_motorista_id()
    ))
  )
);