ALTER TABLE public.viagem_paradas ADD COLUMN IF NOT EXISTS chegou_doca_em timestamptz;

CREATE OR REPLACE FUNCTION public.tg_cerca_virtual_parada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; v_codigo text; u record;
BEGIN
  FOR p IN
    SELECT id, ordem, cliente FROM public.viagem_paradas
    WHERE viagem_id = NEW.viagem_id AND chegou_doca_em IS NULL AND entregue_em IS NULL
      AND latitude IS NOT NULL AND longitude IS NOT NULL
      AND 6371000 * 2 * asin(sqrt(
        power(sin(radians(latitude - NEW.latitude)/2),2) +
        cos(radians(NEW.latitude))*cos(radians(latitude))*power(sin(radians(longitude - NEW.longitude)/2),2)
      )) <= 500
  LOOP
    UPDATE public.viagem_paradas SET chegou_doca_em = NEW.created_at WHERE id = p.id;
    SELECT codigo INTO v_codigo FROM public.viagens WHERE id = NEW.viagem_id;
    FOR u IN SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('administrador','gestor') LOOP
      INSERT INTO public.notificacoes(user_id, tipo, titulo, mensagem, link, origem, origem_id)
      VALUES (u.user_id, 'info', 'CHEGOU NA DOCA',
        'OS ' || coalesce(v_codigo,'') || ' — parada ' || p.ordem || ' ' || coalesce(p.cliente,''),
        '/app/viagens/' || NEW.viagem_id, 'cerca_virtual', p.id);
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cerca_virtual_parada ON public.viagem_localizacoes;
CREATE TRIGGER cerca_virtual_parada AFTER INSERT ON public.viagem_localizacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_cerca_virtual_parada();