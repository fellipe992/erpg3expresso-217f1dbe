-- 1) avisos: bind referenced motorista/veiculo/viagem to the requester
DROP POLICY IF EXISTS "avisos_insert" ON public.avisos;
CREATE POLICY "avisos_insert" ON public.avisos
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    private.is_staff(auth.uid())
    OR (
      (motorista_id IS NULL OR motorista_id = private.current_motorista_id())
      AND (viagem_id IS NULL OR private.is_motorista_viagem(auth.uid(), viagem_id) OR private.is_monitor_viagem(auth.uid(), viagem_id))
      AND (
        veiculo_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.motoristas m
          WHERE m.user_id = auth.uid() AND COALESCE(m.ativo, true) AND m.veiculo_id = avisos.veiculo_id
        )
      )
    )
  )
);

-- 2) manutencoes: driver may only log maintenance for the vehicle assigned to them
DROP POLICY IF EXISTS "insert manutencoes" ON public.manutencoes;
CREATE POLICY "insert manutencoes" ON public.manutencoes
FOR INSERT TO authenticated
WITH CHECK (
  private.is_staff(auth.uid())
  OR (
    motorista_id = private.current_motorista_id()
    AND EXISTS (
      SELECT 1 FROM public.motoristas m
      WHERE m.user_id = auth.uid()
        AND COALESCE(m.ativo, true)
        AND m.id = manutencoes.motorista_id
        AND m.veiculo_id IS NOT NULL
        AND m.veiculo_id = manutencoes.veiculo_id
    )
  )
);

-- 3) storage: tighten invoice upload binding (owner, exact path shape, allowed extensions)
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
      AND lower(right(name, 4)) IN ('.pdf','.jpg','.png','webp')
      OR lower(right(name, 5)) = '.jpeg'
    ) AND (
      array_length(storage.foldername(name), 1) = 1
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