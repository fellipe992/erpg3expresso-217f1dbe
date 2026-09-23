CREATE OR REPLACE FUNCTION public.quinzena_fim(_d date) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN extract(day FROM _d) <= 15
    THEN (date_trunc('month', _d)::date + 14)
    ELSE (date_trunc('month', _d) + interval '1 month - 1 day')::date END
$$;

CREATE OR REPLACE FUNCTION public.tg_abastecimento_financeiro()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _placa TEXT; _os TEXT; _venc DATE;
  _conta_id UUID; _cc TEXT; _cod TEXT;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN RETURN NEW; END IF;
  SELECT placa INTO _placa FROM public.veiculos WHERE id=NEW.veiculo_id;
  IF NEW.viagem_id IS NOT NULL THEN
    SELECT codigo INTO _os FROM public.viagens WHERE id=NEW.viagem_id;
  END IF;
  _cod := CASE lower(COALESCE(NEW.combustivel,''))
    WHEN 'diesel s10' THEN '2.1.001' WHEN 'diesel s500' THEN '2.1.002'
    WHEN 'arla 32' THEN '2.1.003' WHEN 'gasolina' THEN '2.1.004'
    WHEN 'etanol' THEN '2.1.005' WHEN 'gnv' THEN '2.1.006'
    ELSE '2.1.001' END;
  SELECT id, centro_custo INTO _conta_id, _cc FROM public.plano_contas WHERE codigo=_cod LIMIT 1;
  _venc := CASE WHEN NEW.forma_pagamento_operacional='convenio' THEN (NEW.data + INTERVAL '30 days')::date ELSE NULL END;
  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia,
     data_vencimento, status, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento, observacoes)
  VALUES
    ('pagar','Abastecimento '||COALESCE(_placa,'')||' - '||COALESCE(NEW.litros::text,'0')||'L'||
       CASE WHEN NEW.posto IS NOT NULL THEN ' ('||NEW.posto||')' ELSE '' END,
     'Combustível', COALESCE(_cc,'Combustível'), _conta_id,
     NEW.valor_total, NEW.data, public.quinzena_fim(NEW.data), _venc, 'pendente',
     NEW.viagem_id, NEW.veiculo_id, NEW.motorista_id, 'abastecimento', NEW.id, _os,
     'Forma: '||COALESCE(NEW.forma_pagamento_operacional,'não informada'));
  RETURN NEW;
END $function$;

-- Registros existentes: competência = fim da quinzena da data do abastecimento
UPDATE public.financeiro_lancamentos l
SET data_competencia = public.quinzena_fim(a.data)
FROM public.abastecimentos a
WHERE l.origem = 'abastecimento' AND l.origem_id = a.id
  AND l.data_competencia IS DISTINCT FROM public.quinzena_fim(a.data);