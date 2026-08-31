ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS odometro_atual numeric,
  ADD COLUMN IF NOT EXISTS odometro_atualizado_em timestamptz;

-- Atualiza o odômetro do veículo com a maior quilometragem conhecida
CREATE OR REPLACE FUNCTION public.tg_veiculo_odometro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _km numeric; _vid uuid;
BEGIN
  IF TG_TABLE_NAME = 'viagens' THEN
    _vid := NEW.veiculo_id;
    _km := GREATEST(COALESCE(NEW.km_final, 0), COALESCE(NEW.km_inicial, 0));
  ELSE
    _vid := NEW.veiculo_id;
    _km := COALESCE(NEW.km_atual, 0);
  END IF;

  IF _vid IS NULL OR _km IS NULL OR _km <= 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.veiculos v
     SET odometro_atual = _km,
         odometro_atualizado_em = now()
   WHERE v.id = _vid
     AND (v.odometro_atual IS NULL OR v.odometro_atual < _km);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_veiculo_odometro_viagem ON public.viagens;
CREATE TRIGGER trg_veiculo_odometro_viagem
AFTER INSERT OR UPDATE OF km_inicial, km_final, veiculo_id ON public.viagens
FOR EACH ROW EXECUTE FUNCTION public.tg_veiculo_odometro();

DROP TRIGGER IF EXISTS trg_veiculo_odometro_abast ON public.abastecimentos;
CREATE TRIGGER trg_veiculo_odometro_abast
AFTER INSERT OR UPDATE OF km_atual ON public.abastecimentos
FOR EACH ROW EXECUTE FUNCTION public.tg_veiculo_odometro();

DROP TRIGGER IF EXISTS trg_veiculo_odometro_manut ON public.manutencoes;
CREATE TRIGGER trg_veiculo_odometro_manut
AFTER INSERT OR UPDATE OF km_atual ON public.manutencoes
FOR EACH ROW EXECUTE FUNCTION public.tg_veiculo_odometro();

-- Backfill
WITH maiores AS (
  SELECT veiculo_id, MAX(km) AS km FROM (
    SELECT veiculo_id, GREATEST(COALESCE(km_final,0), COALESCE(km_inicial,0)) AS km FROM public.viagens WHERE veiculo_id IS NOT NULL
    UNION ALL
    SELECT veiculo_id, COALESCE(km_atual,0) FROM public.abastecimentos WHERE veiculo_id IS NOT NULL
    UNION ALL
    SELECT veiculo_id, COALESCE(km_atual,0) FROM public.manutencoes WHERE veiculo_id IS NOT NULL
  ) t GROUP BY veiculo_id
)
UPDATE public.veiculos v
   SET odometro_atual = m.km,
       odometro_atualizado_em = now()
  FROM maiores m
 WHERE m.veiculo_id = v.id
   AND m.km > 0
   AND (v.odometro_atual IS NULL OR v.odometro_atual < m.km);

-- Notificações de conclusão de viagem
CREATE OR REPLACE FUNCTION public.tg_viagem_notificar_conclusao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _km numeric; _custo numeric; _os text; _placa text;
  _motorista_user uuid; _motorista_nome text; _u uuid;
BEGIN
  IF NEW.status <> 'concluida' OR OLD.status = 'concluida' THEN
    RETURN NEW;
  END IF;

  _km := CASE WHEN NEW.km_final IS NOT NULL AND NEW.km_inicial IS NOT NULL
              THEN NEW.km_final - NEW.km_inicial ELSE NULL END;
  _os := 'OS ' || COALESCE(NEW.codigo, NEW.id::text);

  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;
  SELECT user_id, nome INTO _motorista_user, _motorista_nome
    FROM public.motoristas WHERE id = NEW.motorista_id;

  SELECT COALESCE(SUM(valor), 0) INTO _custo
    FROM public.financeiro_lancamentos
   WHERE viagem_id = NEW.id AND tipo = 'pagar' AND status <> 'cancelado';

  IF _motorista_user IS NOT NULL THEN
    PERFORM private.notificar(_motorista_user,'viagem','viagem_finalizada_km',
      'Viagem concluída',
      _os || COALESCE(' • ' || _placa,'') ||
        CASE WHEN _km IS NOT NULL THEN ' • ' || to_char(_km,'FM999G999G990') || ' km rodados' ELSE '' END,
      '/app/viagens/'||NEW.id::text,'viagem',NEW.id,'normal',0);
  END IF;

  FOR _u IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id = ur.user_id
    WHERE ur.role IN ('administrador','gestor','financeiro') AND COALESCE(pr.ativo, true)
  LOOP
    PERFORM private.notificar(_u,'viagem','viagem_concluida_gestao',
      'Viagem concluída' || COALESCE(' — ' || _motorista_nome,''),
      _os || COALESCE(' • ' || _placa,'') ||
        CASE WHEN _km IS NOT NULL THEN ' • ' || to_char(_km,'FM999G999G990') || ' km' ELSE '' END ||
        ' • custo R$ ' || to_char(COALESCE(_custo,0),'FM999G999G990D00'),
      '/app/viagens/'||NEW.id::text,'viagem',NEW.id,'normal',0);
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_viagem_notificar_conclusao ON public.viagens;
CREATE TRIGGER trg_viagem_notificar_conclusao
AFTER UPDATE OF status ON public.viagens
FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_notificar_conclusao();