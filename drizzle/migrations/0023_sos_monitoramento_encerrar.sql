CREATE OR REPLACE FUNCTION private.is_monitor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = 'monitor' AND COALESCE(p.ativo, true));
$$;

CREATE POLICY avisos_select_monitor_risco ON public.avisos FOR SELECT TO authenticated
  USING (categoria = 'risco_motorista' AND private.is_monitor(auth.uid()));

CREATE OR REPLACE FUNCTION public.sos_encerrar(_aviso_id uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _equipe boolean; _n integer := 0; r record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  _equipe := private.is_staff(_uid) OR private.is_monitor(_uid);
  FOR r IN SELECT id, created_by FROM public.avisos
    WHERE categoria = 'risco_motorista' AND status <> 'resolvido'
      AND (_aviso_id IS NULL OR id = _aviso_id)
      AND (created_by = _uid OR (_equipe AND _aviso_id IS NOT NULL))
  LOOP
    UPDATE public.avisos SET status = 'resolvido' WHERE id = r.id;
    UPDATE public.notificacoes SET lida_em = now() WHERE origem_id = r.id AND lida_em IS NULL;
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.sos_encerrar(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sos_encerrar(uuid) TO authenticated;