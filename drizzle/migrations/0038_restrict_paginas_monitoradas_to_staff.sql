DROP POLICY IF EXISTS "Autenticados podem ler paginas monitoradas" ON public.paginas_monitoradas;
DROP POLICY IF EXISTS "Autenticados podem inserir paginas monitoradas" ON public.paginas_monitoradas;
DROP POLICY IF EXISTS "Autenticados podem atualizar paginas monitoradas" ON public.paginas_monitoradas;
DROP POLICY IF EXISTS "Autenticados podem remover paginas monitoradas" ON public.paginas_monitoradas;

CREATE POLICY "paginas_monitoradas_staff"
  ON public.paginas_monitoradas
  FOR ALL
  TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));