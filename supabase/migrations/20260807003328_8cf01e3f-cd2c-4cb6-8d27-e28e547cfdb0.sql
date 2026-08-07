CREATE OR REPLACE FUNCTION private.is_motorista_viagem(_user_id uuid, _viagem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.viagens v
    JOIN public.motoristas m ON m.id = v.motorista_id
    WHERE v.id = _viagem_id AND m.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION private.is_motorista_viagem(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_motorista_viagem(uuid, uuid) TO authenticated, service_role;

CREATE TABLE public.viagem_paradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  cliente text,
  endereco text NOT NULL,
  nf text,
  peso_kg numeric,
  latitude double precision,
  longitude double precision,
  chegada_prevista text,
  tempo_descarga_min integer,
  observacoes text,
  entregue_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX viagem_paradas_viagem_idx ON public.viagem_paradas(viagem_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagem_paradas TO authenticated;
GRANT ALL ON public.viagem_paradas TO service_role;

ALTER TABLE public.viagem_paradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paradas_select" ON public.viagem_paradas FOR SELECT TO authenticated
USING (private.is_staff(auth.uid()) OR private.is_motorista_viagem(auth.uid(), viagem_id));

CREATE POLICY "paradas_insert" ON public.viagem_paradas FOR INSERT TO authenticated
WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "paradas_update" ON public.viagem_paradas FOR UPDATE TO authenticated
USING (private.is_staff(auth.uid()) OR private.is_motorista_viagem(auth.uid(), viagem_id))
WITH CHECK (private.is_staff(auth.uid()) OR private.is_motorista_viagem(auth.uid(), viagem_id));

CREATE POLICY "paradas_delete" ON public.viagem_paradas FOR DELETE TO authenticated
USING (private.is_staff(auth.uid()));

CREATE TRIGGER trg_viagem_paradas_updated BEFORE UPDATE ON public.viagem_paradas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();