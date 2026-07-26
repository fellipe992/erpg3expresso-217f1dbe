-- 1) marcar_atrasados: exige usuário staff ativo
CREATE OR REPLACE FUNCTION public.marcar_atrasados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.financeiro_lancamentos
    SET status='atrasado'
    WHERE status='pendente' AND data_vencimento IS NOT NULL AND data_vencimento < CURRENT_DATE;
  UPDATE public.financeiro_lancamentos
    SET status='pendente'
    WHERE status='atrasado' AND (data_vencimento IS NULL OR data_vencimento >= CURRENT_DATE);
END;
$function$;

REVOKE ALL ON FUNCTION public.marcar_atrasados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_atrasados() TO authenticated;

-- 2) Comprovantes de abastecimento: motorista pode excluir os próprios
DROP POLICY IF EXISTS "abast comprov delete" ON storage.objects;
CREATE POLICY "abast comprov delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'abastecimento-comprovantes'
  AND (
    private.is_staff(auth.uid())
    OR (
      owner = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.abastecimentos a
        WHERE a.comprovante_path = storage.objects.name
          AND a.motorista_id = private.current_motorista_id()
      )
    )
  )
);

-- 3) Auditoria de viagem: garante que nenhuma inserção manual é possível
DROP POLICY IF EXISTS "authenticated insert auditoria" ON public.viagem_auditoria;
REVOKE INSERT, UPDATE, DELETE ON public.viagem_auditoria FROM authenticated, anon;