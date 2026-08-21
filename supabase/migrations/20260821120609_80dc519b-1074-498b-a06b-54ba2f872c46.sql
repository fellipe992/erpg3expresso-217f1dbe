CREATE OR REPLACE FUNCTION public.tg_abastecimento_calc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_km NUMERIC;
BEGIN
  -- Aditivos (ex.: Arla 32) não entram no controle de consumo do veículo
  IF COALESCE(NEW.combustivel, '') ILIKE '%arla%' THEN
    NEW.km_percorridos := NULL;
    NEW.consumo_medio := NULL;
    NEW.custo_por_km := NULL;
    RETURN NEW;
  END IF;

  SELECT km_atual INTO _prev_km
  FROM public.abastecimentos
  WHERE veiculo_id = NEW.veiculo_id
    AND COALESCE(combustivel, '') NOT ILIKE '%arla%'
    AND (data < NEW.data OR (data = NEW.data AND (hora IS NULL OR hora < COALESCE(NEW.hora, '23:59'::time))))
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY data DESC, hora DESC NULLS LAST
  LIMIT 1;

  IF _prev_km IS NOT NULL AND NEW.km_atual > _prev_km THEN
    NEW.km_percorridos := NEW.km_atual - _prev_km;
    IF NEW.litros > 0 THEN
      NEW.consumo_medio := ROUND((NEW.km_percorridos / NEW.litros)::numeric, 2);
    END IF;
    IF NEW.km_percorridos > 0 THEN
      NEW.custo_por_km := ROUND((NEW.valor_total / NEW.km_percorridos)::numeric, 3);
    END IF;
  ELSE
    NEW.km_percorridos := NULL;
    NEW.consumo_medio := NULL;
    NEW.custo_por_km := NULL;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.abastecimentos
SET km_percorridos = NULL, consumo_medio = NULL, custo_por_km = NULL
WHERE COALESCE(combustivel, '') ILIKE '%arla%';

-- recalcula as linhas de tração com a nova regra
UPDATE public.abastecimentos a
SET km_atual = a.km_atual
WHERE COALESCE(a.combustivel, '') NOT ILIKE '%arla%';