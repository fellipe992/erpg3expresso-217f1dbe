
-- 1) motorista_veiculo_historico: restringir SELECT
DROP POLICY IF EXISTS "read historico vinc" ON public.motorista_veiculo_historico;
CREATE POLICY "read historico vinc"
  ON public.motorista_veiculo_historico
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR motorista_id = public.current_motorista_id()
  );

-- 2) veiculos: restringir SELECT
DROP POLICY IF EXISTS "read veiculos" ON public.veiculos;
CREATE POLICY "read veiculos"
  ON public.veiculos
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.motoristas m
      WHERE m.user_id = auth.uid()
        AND m.ativo
        AND m.veiculo_id = veiculos.id
    )
  );

-- 3) storage viagem-fotos: SELECT com join em viagens
DROP POLICY IF EXISTS "Autenticados leem fotos de viagem" ON storage.objects;
CREATE POLICY "Ler fotos de viagem autorizadas"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'viagem-fotos'
    AND EXISTS (
      SELECT 1 FROM public.viagens v
      WHERE v.id::text = split_part(storage.objects.name, '/', 1)
        AND (public.is_staff(auth.uid()) OR v.motorista_id = public.current_motorista_id())
    )
  );

-- 4) storage viagem-fotos: INSERT
DROP POLICY IF EXISTS "Autenticados enviam fotos de viagem" ON storage.objects;
CREATE POLICY "Enviar fotos de viagem autorizadas"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'viagem-fotos'
    AND EXISTS (
      SELECT 1 FROM public.viagens v
      WHERE v.id::text = split_part(storage.objects.name, '/', 1)
        AND (public.is_staff(auth.uid()) OR v.motorista_id = public.current_motorista_id())
    )
  );

-- 5) storage viagem-fotos: UPDATE
DROP POLICY IF EXISTS "Autenticados atualizam fotos de viagem" ON storage.objects;
CREATE POLICY "Atualizar fotos de viagem autorizadas"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'viagem-fotos'
    AND EXISTS (
      SELECT 1 FROM public.viagens v
      WHERE v.id::text = split_part(storage.objects.name, '/', 1)
        AND (public.is_staff(auth.uid()) OR v.motorista_id = public.current_motorista_id())
    )
  )
  WITH CHECK (
    bucket_id = 'viagem-fotos'
    AND EXISTS (
      SELECT 1 FROM public.viagens v
      WHERE v.id::text = split_part(storage.objects.name, '/', 1)
        AND (public.is_staff(auth.uid()) OR v.motorista_id = public.current_motorista_id())
    )
  );

-- 6) plano_auditoria INSERT: bloquear escrita manual (triggers SECURITY DEFINER ignoram RLS)
DROP POLICY IF EXISTS "system insert plano_auditoria" ON public.plano_auditoria;
CREATE POLICY "system insert plano_auditoria"
  ON public.plano_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- 7) Revoga EXECUTE público de funções internas (triggers/manutenção)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_financeiro_status_recalc() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_auto_link_viagem_abast() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_auto_link_viagem_manut() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_abastecimento_calc() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_motorista_vinculo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_viagem_codigo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_manutencao_financeiro() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_viagem_financeiro() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_abastecimento_financeiro() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_plano_auditoria() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.marcar_atrasados() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_primary_role(uuid) FROM PUBLIC, anon;
