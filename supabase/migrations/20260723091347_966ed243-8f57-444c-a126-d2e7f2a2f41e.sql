
DROP POLICY IF EXISTS "update veiculos" ON public.veiculos;
CREATE POLICY "update veiculos" ON public.veiculos FOR UPDATE
  USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'financeiro'::app_role));

DROP POLICY IF EXISTS "update motoristas" ON public.motoristas;
CREATE POLICY "update motoristas" ON public.motoristas FOR UPDATE
  USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'financeiro'::app_role));

DROP POLICY IF EXISTS "update fornecedores" ON public.fornecedores;
CREATE POLICY "update fornecedores" ON public.fornecedores FOR UPDATE
  USING (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'financeiro'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role) OR private.has_role(auth.uid(), 'gestor'::app_role) OR private.has_role(auth.uid(), 'financeiro'::app_role));

DROP POLICY IF EXISTS "update abastecimentos" ON public.abastecimentos;
CREATE POLICY "update abastecimentos" ON public.abastecimentos FOR UPDATE
  USING (private.is_staff(auth.uid()) OR (motorista_id = private.current_motorista_id()))
  WITH CHECK (private.is_staff(auth.uid()) OR (motorista_id = private.current_motorista_id()));

DROP POLICY IF EXISTS "update manutencoes" ON public.manutencoes;
CREATE POLICY "update manutencoes" ON public.manutencoes FOR UPDATE
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
