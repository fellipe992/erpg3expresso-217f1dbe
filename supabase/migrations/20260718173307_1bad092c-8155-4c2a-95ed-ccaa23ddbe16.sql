
-- 1) Trigger: viagem -> conta a receber (frete)
CREATE OR REPLACE FUNCTION public.tg_viagem_financeiro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id UUID;
BEGIN
  -- Cancelada: remove lançamento pendente vinculado
  IF NEW.status = 'cancelada' THEN
    DELETE FROM public.financeiro_lancamentos
    WHERE viagem_id = NEW.id AND tipo = 'receber' AND status = 'pendente';
    RETURN NEW;
  END IF;

  -- Só gera quando há cliente + valor + status util
  IF NEW.cliente_id IS NULL OR NEW.valor_frete IS NULL OR NEW.valor_frete <= 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('em_andamento','concluida') THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _existing_id
  FROM public.financeiro_lancamentos
  WHERE viagem_id = NEW.id AND tipo = 'receber'
  LIMIT 1;

  IF _existing_id IS NULL THEN
    INSERT INTO public.financeiro_lancamentos
      (tipo, descricao, categoria, valor, data_emissao, data_vencimento, status, cliente_id, viagem_id)
    VALUES
      ('receber',
       'Frete viagem ' || COALESCE(NEW.codigo, NEW.id::text),
       'Frete',
       NEW.valor_frete,
       COALESCE(NEW.data_saida::date, CURRENT_DATE),
       COALESCE(NEW.data_prevista_chegada::date, NEW.data_chegada::date, CURRENT_DATE + INTERVAL '30 days'),
       'pendente',
       NEW.cliente_id,
       NEW.id);
  ELSE
    UPDATE public.financeiro_lancamentos
    SET valor = NEW.valor_frete,
        cliente_id = NEW.cliente_id,
        data_vencimento = COALESCE(NEW.data_prevista_chegada::date, NEW.data_chegada::date, data_vencimento)
    WHERE id = _existing_id AND status = 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_viagem_financeiro ON public.viagens;
CREATE TRIGGER trg_viagem_financeiro
  AFTER INSERT OR UPDATE OF status, valor_frete, cliente_id, data_prevista_chegada, data_chegada
  ON public.viagens
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_viagem_financeiro();

-- 2) Trigger: abastecimento -> conta a pagar
CREATE OR REPLACE FUNCTION public.tg_abastecimento_financeiro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _placa TEXT;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, valor, data_emissao, data_vencimento, status,
     data_pagamento, fornecedor_id, observacoes)
  VALUES
    ('pagar',
     'Abastecimento ' || COALESCE(_placa, '') || ' - ' || COALESCE(NEW.litros::text, '0') || 'L' ||
       CASE WHEN NEW.posto IS NOT NULL THEN ' (' || NEW.posto || ')' ELSE '' END,
     'Combustível',
     NEW.valor_total,
     NEW.data,
     NEW.data,
     'pago',
     NEW.data,
     NEW.fornecedor_id,
     'Gerado automaticamente do abastecimento ' || NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abastecimento_financeiro ON public.abastecimentos;
CREATE TRIGGER trg_abastecimento_financeiro
  AFTER INSERT ON public.abastecimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_abastecimento_financeiro();

-- 3) Trigger: manutencao -> conta a pagar
CREATE OR REPLACE FUNCTION public.tg_manutencao_financeiro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _placa TEXT;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, valor, data_emissao, data_vencimento, status,
     data_pagamento, fornecedor_id, observacoes)
  VALUES
    ('pagar',
     'Manutenção ' || COALESCE(_placa, '') || ' - ' || NEW.tipo ||
       CASE WHEN NEW.oficina IS NOT NULL THEN ' (' || NEW.oficina || ')' ELSE '' END,
     'Manutenção',
     NEW.valor,
     NEW.data,
     NEW.data,
     'pago',
     NEW.data,
     NEW.fornecedor_id,
     'Gerado automaticamente da manutenção ' || NEW.id::text);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_manutencao_financeiro ON public.manutencoes;
CREATE TRIGGER trg_manutencao_financeiro
  AFTER INSERT ON public.manutencoes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_manutencao_financeiro();
