
CREATE OR REPLACE FUNCTION public.tg_abastecimento_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _placa TEXT;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, valor, data_emissao, data_vencimento, status,
     data_pagamento, observacoes)
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
     'Gerado automaticamente do abastecimento ' || NEW.id::text);
  RETURN NEW;
END;
$$;
