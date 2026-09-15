-- 1) SECURITY DEFINER RPCs não devem ser executáveis por usuários anônimos
REVOKE EXECUTE ON FUNCTION public.viagem_excluir(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.viagem_restaurar(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.viagem_excluir(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.viagem_restaurar(uuid) TO authenticated;

-- 2) company-assets: leitura ampla -> apenas logotipos públicos do app + staff
DROP POLICY IF EXISTS "Autenticados leem company-assets" ON storage.objects;

CREATE POLICY "Leitura company-assets restrita"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'company-assets'
  AND (
    private.is_staff(auth.uid())
    OR name LIKE 'logo%'
    OR name LIKE 'logos/%'
  )
);