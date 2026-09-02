ALTER TYPE public.veiculo_tipo ADD VALUE IF NOT EXISTS 'fiorino';
ALTER TYPE public.veiculo_tipo ADD VALUE IF NOT EXISTS 'tres_quartos';
ALTER TYPE public.veiculo_tipo ADD VALUE IF NOT EXISTS 'bitruck';

CREATE OR REPLACE FUNCTION public.viagem_total_cliente(_viagem_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE(v.valor_frete,0)
    + COALESCE(v.pedagio_cliente,0)
    + COALESCE((SELECT SUM(a.valor_cliente) FROM public.viagem_ajustes a
                 WHERE a.viagem_id = v.id AND a.tipo='adicional'),0)
    - COALESCE((SELECT SUM(a.valor_cliente) FROM public.viagem_ajustes a
                 WHERE a.viagem_id = v.id AND a.tipo='desconto'),0)
  , 0)
  FROM public.viagens v WHERE v.id = _viagem_id
$$;

CREATE OR REPLACE FUNCTION public.tg_viagem_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_id UUID;
  _conta_id UUID;
  _cc TEXT;
  _total NUMERIC;
BEGIN
  IF NEW.status = 'cancelada' THEN
    DELETE FROM public.financeiro_lancamentos
      WHERE viagem_id = NEW.id AND tipo='receber' AND status IN ('pendente','atrasado');
    RETURN NEW;
  END IF;
  IF NEW.cliente_id IS NULL OR NEW.valor_frete IS NULL OR NEW.valor_frete <= 0 THEN
    RETURN NEW;
  END IF;

  _total := public.viagem_total_cliente(NEW.id);
  IF _total IS NULL OR _total <= 0 THEN
    _total := NEW.valor_frete;
  END IF;

  SELECT id, centro_custo INTO _conta_id, _cc
    FROM public.plano_contas WHERE codigo='1.1.001' LIMIT 1;

  SELECT id INTO _existing_id FROM public.financeiro_lancamentos
    WHERE viagem_id=NEW.id AND tipo='receber' LIMIT 1;

  IF _existing_id IS NULL THEN
    INSERT INTO public.financeiro_lancamentos
      (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_vencimento, status,
       cliente_id, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento)
    VALUES
      ('receber','Frete viagem OS '||COALESCE(NEW.codigo,NEW.id::text),'Frete',COALESCE(_cc,'Receita Operacional'),_conta_id,
       _total, COALESCE(NEW.created_at::date,CURRENT_DATE), NULL, 'pendente',
       NEW.cliente_id, NEW.id, NEW.veiculo_id, NEW.motorista_id, 'viagem', NEW.id, NEW.codigo);
  ELSE
    UPDATE public.financeiro_lancamentos
      SET valor=_total, cliente_id=NEW.cliente_id, veiculo_id=NEW.veiculo_id,
          motorista_id=NEW.motorista_id, numero_documento=NEW.codigo,
          origem='viagem', origem_id=NEW.id,
          plano_conta_id=COALESCE(plano_conta_id,_conta_id),
          centro_custo=COALESCE(centro_custo,_cc,'Receita Operacional')
      WHERE id=_existing_id AND status IN ('pendente','atrasado');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_ajuste_recalc_receber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vid UUID := COALESCE(NEW.viagem_id, OLD.viagem_id);
  _total NUMERIC;
BEGIN
  _total := public.viagem_total_cliente(_vid);
  IF _total > 0 THEN
    UPDATE public.financeiro_lancamentos
      SET valor = _total
      WHERE viagem_id = _vid AND tipo='receber' AND status IN ('pendente','atrasado')
        AND fechamento_id IS NULL;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_ajuste_recalc_receber ON public.viagem_ajustes;
CREATE TRIGGER trg_ajuste_recalc_receber
AFTER INSERT OR UPDATE OR DELETE ON public.viagem_ajustes
FOR EACH ROW EXECUTE FUNCTION public.tg_ajuste_recalc_receber();