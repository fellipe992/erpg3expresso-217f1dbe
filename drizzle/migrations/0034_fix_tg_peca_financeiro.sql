CREATE OR REPLACE FUNCTION public.tg_peca_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _placa TEXT; _agregado BOOLEAN; _conta_id UUID; _cc TEXT;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN RETURN NEW; END IF;
  SELECT placa, COALESCE(agregado,false) INTO _placa, _agregado FROM public.veiculos WHERE id=NEW.veiculo_id;
  IF _agregado THEN RETURN NEW; END IF;
  SELECT id, centro_custo INTO _conta_id, _cc FROM public.plano_contas WHERE codigo='2.2.004' LIMIT 1;
  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia,
     status, veiculo_id, motorista_id, origem, origem_id, numero_documento)
  VALUES ('pagar', 'Peça '||COALESCE(_placa,'')||' - '||NEW.descricao, 'Peças', COALESCE(_cc,'Manutenção'), _conta_id,
     NEW.valor_total, NEW.data, public.quinzena_fim(NEW.data), 'pendente', NEW.veiculo_id, NEW.motorista_id,
     'peca', NEW.id, NEW.nota_fiscal);
  RETURN NEW;
END $$;