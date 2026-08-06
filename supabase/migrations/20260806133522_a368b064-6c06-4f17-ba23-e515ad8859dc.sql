-- Helper security definer: verifica se o usuário é monitor do cliente da viagem
CREATE OR REPLACE FUNCTION private.is_monitor_viagem(_user_id uuid, _viagem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.viagens v
    JOIN public.monitor_clientes mc
      ON mc.cliente_id = v.cliente_id
    WHERE v.id = _viagem_id
      AND v.status = 'em_andamento'::viagem_status
      AND mc.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION private.is_monitor_viagem(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_monitor_viagem(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "monitor read localizacoes do cliente" ON public.viagem_localizacoes;
CREATE POLICY "monitor read localizacoes do cliente"
ON public.viagem_localizacoes
FOR SELECT
TO authenticated
USING (private.is_monitor_viagem(auth.uid(), viagem_id));
