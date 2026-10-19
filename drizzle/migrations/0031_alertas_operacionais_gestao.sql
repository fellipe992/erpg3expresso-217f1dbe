CREATE OR REPLACE FUNCTION private.notificar_gestores(_categoria text, _tipo text, _titulo text, _mensagem text, _link text, _origem text, _origem_id uuid, _prioridade text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _u uuid;
BEGIN
  FOR _u IN SELECT DISTINCT ur.user_id FROM public.user_roles ur JOIN public.profiles pr ON pr.id = ur.user_id
    WHERE ur.role IN ('administrador','gestor') AND COALESCE(pr.ativo, true)
  LOOP
    PERFORM private.notificar(_u,_categoria,_tipo,_titulo,_mensagem,_link,_origem,_origem_id,_prioridade,0);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.viagem_rotulo(_viagem uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'OS ' || COALESCE(v.codigo, v.id::text) || COALESCE(' • ' || ve.placa,'') || COALESCE(' • ' || m.nome,'')
  FROM public.viagens v LEFT JOIN public.veiculos ve ON ve.id = v.veiculo_id LEFT JOIN public.motoristas m ON m.id = v.motorista_id
  WHERE v.id = _viagem
$$;

-- Pedido de posição é rotina sistêmica: não vira alerta para a gestão.
CREATE OR REPLACE FUNCTION public.tg_aviso_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _u uuid; _nome text;
BEGIN
  IF NEW.categoria = 'pedido_posicao' THEN RETURN NEW; END IF;
  SELECT COALESCE(p.nome, p.email) INTO _nome FROM public.profiles p WHERE p.id = NEW.created_by;
  FOR _u IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id = ur.user_id
    WHERE ur.role IN ('administrador','gestor') AND COALESCE(pr.ativo, true)
  LOOP
    PERFORM private.notificar(_u,'sistema','aviso_motorista',
      'Aviso de ' || COALESCE(_nome,'motorista'),
      NEW.assunto || ' — ' || left(NEW.mensagem, 140),
      '/app/avisos','aviso',NEW.id,'alta',0);
  END LOOP;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION private.tg_viagem_iniciada_gestao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'em_andamento' AND OLD.status IS DISTINCT FROM 'em_andamento' THEN
    PERFORM private.notificar_gestores('viagem','viagem_iniciada_gestao','Viagem iniciada',
      private.viagem_rotulo(NEW.id) || COALESCE(' • ' || NEW.origem_cidade || '/' || NEW.origem_uf, '') || COALESCE(' → ' || NEW.destino_cidade || '/' || NEW.destino_uf, ''),
      '/app/viagens/'||NEW.id::text,'viagem',NEW.id,'normal');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_viagem_iniciada_gestao ON public.viagens;
CREATE TRIGGER trg_viagem_iniciada_gestao AFTER UPDATE OF status ON public.viagens FOR EACH ROW EXECUTE FUNCTION private.tg_viagem_iniciada_gestao();

CREATE OR REPLACE FUNCTION private.tg_parada_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _cli text := COALESCE(NULLIF(NEW.cliente,''), NEW.endereco, 'parada ' || NEW.ordem); _rot text := private.viagem_rotulo(NEW.viagem_id); _link text := '/app/viagens/'||NEW.viagem_id::text;
BEGIN
  IF NEW.entregue_em IS NOT NULL AND OLD.entregue_em IS NULL THEN
    PERFORM private.notificar_gestores('viagem','parada_descarregada','Descarga concluída — ' || _cli, _rot, _link,'parada',NEW.id,'normal');
  ELSIF NEW.chegou_doca_em IS NOT NULL AND OLD.chegou_doca_em IS NULL THEN
    PERFORM private.notificar_gestores('viagem','parada_chegada','Chegou no cliente — ' || _cli, _rot, _link,'parada',NEW.id,'normal');
  ELSIF NEW.a_caminho_em IS NOT NULL AND OLD.a_caminho_em IS NULL THEN
    PERFORM private.notificar_gestores('viagem','parada_a_caminho','A caminho de ' || _cli, _rot || COALESCE(' • ' || NEW.endereco,''), _link,'parada',NEW.id,'normal');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_parada_notificar ON public.viagem_paradas;
CREATE TRIGGER trg_parada_notificar AFTER UPDATE ON public.viagem_paradas FOR EACH ROW EXECUTE FUNCTION private.tg_parada_notificar();

CREATE OR REPLACE FUNCTION private.tg_ocorrencia_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM private.notificar_gestores('viagem','ocorrencia_motorista','Ocorrência registrada',
    private.viagem_rotulo(NEW.viagem_id) || COALESCE(' • ' || NEW.local,'') || ' — ' || left(COALESCE(NEW.descricao,''),300),
    '/app/viagens/'||NEW.viagem_id::text,'ocorrencia',NEW.id,'alta');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_ocorrencia_notificar ON public.viagem_ocorrencias;
CREATE TRIGGER trg_ocorrencia_notificar AFTER INSERT ON public.viagem_ocorrencias FOR EACH ROW EXECUTE FUNCTION private.tg_ocorrencia_notificar();

CREATE OR REPLACE FUNCTION private.tg_checklist_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _falhas text;
BEGIN
  IF NEW.viagem_id IS NULL THEN RETURN NEW; END IF;
  _falhas := concat_ws(', ',
    CASE WHEN NEW.pneus_ok = false THEN 'pneus' END, CASE WHEN NEW.oleo_ok = false THEN 'óleo' END,
    CASE WHEN NEW.agua_radiador_ok = false THEN 'água do radiador' END, CASE WHEN NEW.freios_ok = false THEN 'freios' END,
    CASE WHEN NEW.tacografo_ok = false THEN 'tacógrafo' END);
  PERFORM private.notificar_gestores('viagem','checklist_' || NEW.tipo::text,
    'Checklist de ' || NEW.tipo::text || ' enviado',
    private.viagem_rotulo(NEW.viagem_id) || COALESCE(' • ' || to_char(NEW.km,'FM999G999G990') || ' km','') ||
      COALESCE(' • combustível ' || NEW.combustivel_pct || '%','') ||
      CASE WHEN _falhas <> '' THEN ' • ATENÇÃO: ' || _falhas ELSE ' • itens OK' END ||
      COALESCE(' — ' || left(NEW.observacoes,200),''),
    '/app/viagens/'||NEW.viagem_id::text,'checklist',NEW.id, CASE WHEN _falhas <> '' THEN 'alta' ELSE 'normal' END);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_checklist_notificar ON public.checklists;
CREATE TRIGGER trg_checklist_notificar AFTER INSERT ON public.checklists FOR EACH ROW EXECUTE FUNCTION private.tg_checklist_notificar();