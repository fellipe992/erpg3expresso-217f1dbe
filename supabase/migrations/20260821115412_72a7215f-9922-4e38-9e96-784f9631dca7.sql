ALTER TABLE public.abastecimentos ADD COLUMN IF NOT EXISTS grupo_id uuid;

-- Motorista pode registrar manutenção do próprio veículo
DROP POLICY IF EXISTS "insert manutencoes" ON public.manutencoes;
CREATE POLICY "insert manutencoes" ON public.manutencoes FOR INSERT TO authenticated
WITH CHECK (private.is_staff(auth.uid()) OR motorista_id = private.current_motorista_id());

DROP POLICY IF EXISTS "update manutencoes" ON public.manutencoes;
CREATE POLICY "update manutencoes" ON public.manutencoes FOR UPDATE TO authenticated
USING (private.is_staff(auth.uid()) OR (created_by = auth.uid() AND motorista_id = private.current_motorista_id()))
WITH CHECK (private.is_staff(auth.uid()) OR (created_by = auth.uid() AND motorista_id = private.current_motorista_id()));

CREATE TABLE IF NOT EXISTS public.despesas_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid REFERENCES public.veiculos(id),
  motorista_id uuid REFERENCES public.motoristas(id),
  viagem_id uuid REFERENCES public.viagens(id),
  data date NOT NULL DEFAULT current_date,
  categoria text NOT NULL,
  descricao text,
  valor numeric NOT NULL DEFAULT 0,
  forma_pagamento_operacional text,
  comprovante_path text,
  observacoes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.despesas_operacionais TO authenticated;
GRANT ALL ON public.despesas_operacionais TO service_role;
ALTER TABLE public.despesas_operacionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read despesas_op" ON public.despesas_operacionais FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()) OR motorista_id = private.current_motorista_id());

CREATE POLICY "insert despesas_op" ON public.despesas_operacionais FOR INSERT TO authenticated
WITH CHECK (private.is_staff(auth.uid()) OR motorista_id = private.current_motorista_id());

CREATE POLICY "update despesas_op" ON public.despesas_operacionais FOR UPDATE TO authenticated
USING (private.is_staff(auth.uid()) OR (created_by = auth.uid() AND motorista_id = private.current_motorista_id()))
WITH CHECK (private.is_staff(auth.uid()) OR (created_by = auth.uid() AND motorista_id = private.current_motorista_id()));

CREATE POLICY "delete despesas_op" ON public.despesas_operacionais FOR DELETE TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role));

CREATE TRIGGER trg_despesas_op_updated_at BEFORE UPDATE ON public.despesas_operacionais
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- vincula automaticamente à viagem em andamento
CREATE OR REPLACE FUNCTION public.tg_auto_link_viagem_despesa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.viagem_id IS NULL AND NEW.motorista_id IS NOT NULL THEN
    SELECT id INTO NEW.viagem_id
    FROM public.viagens
    WHERE motorista_id = NEW.motorista_id
      AND status = 'em_andamento'
    ORDER BY data_saida DESC NULLS LAST
    LIMIT 1;
  END IF;
  IF NEW.veiculo_id IS NULL AND NEW.motorista_id IS NOT NULL THEN
    SELECT veiculo_id INTO NEW.veiculo_id FROM public.motoristas WHERE id = NEW.motorista_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_despesa_auto_link BEFORE INSERT ON public.despesas_operacionais
FOR EACH ROW EXECUTE FUNCTION public.tg_auto_link_viagem_despesa();

-- gera conta a pagar
CREATE OR REPLACE FUNCTION public.tg_despesa_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _placa TEXT; _os TEXT; _conta_id UUID; _cc TEXT; _cod TEXT;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN RETURN NEW; END IF;
  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;
  IF NEW.viagem_id IS NOT NULL THEN
    SELECT codigo INTO _os FROM public.viagens WHERE id = NEW.viagem_id;
  END IF;

  _cod := CASE lower(COALESCE(NEW.categoria,''))
    WHEN 'alimentação' THEN '2.5.001'
    WHEN 'hospedagem' THEN '2.6.001'
    WHEN 'pedágio' THEN '2.3.001'
    ELSE '8.1.001' END;
  SELECT id, centro_custo INTO _conta_id, _cc FROM public.plano_contas WHERE codigo = _cod LIMIT 1;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, status,
     viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento, observacoes)
  VALUES
    ('pagar', NEW.categoria || CASE WHEN NEW.descricao IS NOT NULL THEN ' - '||NEW.descricao ELSE '' END ||
       CASE WHEN _placa IS NOT NULL THEN ' ('||_placa||')' ELSE '' END,
     NEW.categoria, COALESCE(_cc,'Operacional'), _conta_id,
     NEW.valor, NEW.data, 'pendente',
     NEW.viagem_id, NEW.veiculo_id, NEW.motorista_id, 'despesa_operacional', NEW.id, _os,
     'Forma: '||COALESCE(NEW.forma_pagamento_operacional,'não informada'));
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_despesa_financeiro AFTER INSERT ON public.despesas_operacionais
FOR EACH ROW EXECUTE FUNCTION public.tg_despesa_financeiro();