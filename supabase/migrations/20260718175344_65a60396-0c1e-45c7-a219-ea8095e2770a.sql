
-- 1) Vencimento opcional
ALTER TABLE public.financeiro_lancamentos ALTER COLUMN data_vencimento DROP NOT NULL;

-- 2) Recalcular status quando vencimento muda (preserva pago/cancelado)
CREATE OR REPLACE FUNCTION public.tg_financeiro_status_recalc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('pago','cancelado') THEN
    RETURN NEW;
  END IF;
  IF NEW.data_vencimento IS NULL OR NEW.data_vencimento >= CURRENT_DATE THEN
    NEW.status := 'pendente';
  ELSE
    NEW.status := 'atrasado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financeiro_status_recalc ON public.financeiro_lancamentos;
CREATE TRIGGER trg_financeiro_status_recalc
BEFORE INSERT OR UPDATE OF data_vencimento, status, data_pagamento
ON public.financeiro_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.tg_financeiro_status_recalc();

-- 3) marcar_atrasados: bidirecional (marca e desmarca)
CREATE OR REPLACE FUNCTION public.marcar_atrasados()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.financeiro_lancamentos
    SET status='atrasado'
    WHERE status='pendente' AND data_vencimento IS NOT NULL AND data_vencimento < CURRENT_DATE;
  UPDATE public.financeiro_lancamentos
    SET status='pendente'
    WHERE status='atrasado' AND (data_vencimento IS NULL OR data_vencimento >= CURRENT_DATE);
END;
$$;

-- 4) Viagem -> financeiro: nao preencher vencimento; nao sobrescrever alteracoes do admin
CREATE OR REPLACE FUNCTION public.tg_viagem_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing_id UUID;
BEGIN
  IF NEW.status = 'cancelada' THEN
    DELETE FROM public.financeiro_lancamentos
    WHERE viagem_id = NEW.id AND tipo = 'receber' AND status IN ('pendente','atrasado');
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NULL OR NEW.valor_frete IS NULL OR NEW.valor_frete <= 0 THEN
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
       'Frete viagem OS ' || COALESCE(NEW.codigo, NEW.id::text),
       'Frete',
       NEW.valor_frete,
       COALESCE(NEW.created_at::date, CURRENT_DATE),
       NULL,
       'pendente',
       NEW.cliente_id,
       NEW.id);
  ELSE
    UPDATE public.financeiro_lancamentos
    SET valor = NEW.valor_frete,
        cliente_id = NEW.cliente_id
    WHERE id = _existing_id AND status IN ('pendente','atrasado');
  END IF;

  RETURN NEW;
END;
$$;

-- 5) Numeracao automatica de viagens (OS)
CREATE SEQUENCE IF NOT EXISTS public.viagens_codigo_seq;
SELECT setval(
  'public.viagens_codigo_seq',
  GREATEST(1, COALESCE((SELECT MAX(codigo::int) FROM public.viagens WHERE codigo ~ '^[0-9]+$'), 0)),
  true
);

CREATE OR REPLACE FUNCTION public.tg_viagem_codigo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    NEW.codigo := nextval('public.viagens_codigo_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_viagem_codigo ON public.viagens;
CREATE TRIGGER trg_viagem_codigo
BEFORE INSERT ON public.viagens
FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_codigo();

GRANT USAGE ON SEQUENCE public.viagens_codigo_seq TO authenticated, service_role;
