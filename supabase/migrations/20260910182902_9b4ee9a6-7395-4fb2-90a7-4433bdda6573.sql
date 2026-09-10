-- 1) Notifica o MOTORISTA quando a operação pede a posição dele
CREATE OR REPLACE FUNCTION public.tg_pedido_posicao_notificar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _user_id uuid; _placa text;
BEGIN
  IF NEW.categoria IS DISTINCT FROM 'pedido_posicao' THEN RETURN NEW; END IF;
  IF NEW.motorista_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO _user_id FROM public.motoristas WHERE id = NEW.motorista_id;
  IF _user_id IS NULL THEN RETURN NEW; END IF;
  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;

  PERFORM private.notificar(
    _user_id, 'monitoramento', 'pedido_posicao',
    'A operação pediu sua localização',
    'Abra o aplicativo para enviar sua posição atual' || COALESCE(' • ' || _placa, '') || '.',
    CASE WHEN NEW.viagem_id IS NOT NULL THEN '/app/viagens/' || NEW.viagem_id::text ELSE '/app' END,
    'aviso', NEW.id, 'alta', 0);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS pedido_posicao_notificar ON public.avisos;
CREATE TRIGGER pedido_posicao_notificar
AFTER INSERT ON public.avisos
FOR EACH ROW EXECUTE FUNCTION public.tg_pedido_posicao_notificar();

-- 2) Monitoramento passa a devolver a foto de perfil do motorista (só para a equipe interna)
DROP FUNCTION IF EXISTS public.monitoramento_viagens_ativas();

CREATE FUNCTION public.monitoramento_viagens_ativas()
RETURNS TABLE(
  id uuid, codigo text, origem_cidade text, origem_uf text, destino_cidade text, destino_uf text,
  data_saida timestamp with time zone, km_inicial numeric, cliente_nome text,
  motorista_id uuid, motorista_nome text, motorista_telefone text, motorista_foto text,
  veiculo_id uuid, veiculo_placa text, veiculo_modelo text, veiculo_marca text, veiculo_agregado boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT v.id, v.codigo, v.origem_cidade, v.origem_uf, v.destino_cidade, v.destino_uf,
         v.data_saida, v.km_inicial,
         c.razao_social,
         m.id, m.nome,
         CASE WHEN private.is_staff(auth.uid()) THEN m.telefone ELSE NULL END,
         CASE WHEN private.is_staff(auth.uid()) THEN p.avatar_url ELSE NULL END,
         ve.id, ve.placa, ve.modelo, ve.marca, ve.agregado
    FROM public.viagens v
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    LEFT JOIN public.motoristas m ON m.id = v.motorista_id
    LEFT JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN public.veiculos ve ON ve.id = v.veiculo_id
   WHERE v.status = 'em_andamento'
     AND (
       private.is_staff(auth.uid())
       OR private.is_monitor_cliente(auth.uid(), v.cliente_id)
     )
$function$;

REVOKE ALL ON FUNCTION public.monitoramento_viagens_ativas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitoramento_viagens_ativas() TO authenticated;