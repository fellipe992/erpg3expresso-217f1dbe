CREATE TABLE IF NOT EXISTS public.viagens_excluidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL,
  codigo TEXT,
  cliente_nome TEXT,
  motorista_nome TEXT,
  veiculo_placa TEXT,
  dados JSONB NOT NULL,
  paradas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ajustes JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_by UUID
);

CREATE INDEX IF NOT EXISTS viagens_excluidas_deleted_at_idx ON public.viagens_excluidas (deleted_at DESC);

GRANT SELECT, DELETE ON public.viagens_excluidas TO authenticated;
GRANT ALL ON public.viagens_excluidas TO service_role;

ALTER TABLE public.viagens_excluidas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viagens_excluidas_select_staff" ON public.viagens_excluidas
FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE POLICY "viagens_excluidas_delete_admin" ON public.viagens_excluidas
FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'administrador'::app_role));

-- Exclui a viagem guardando uma cópia completa (viagem + paradas + ajustes) na lixeira.
CREATE OR REPLACE FUNCTION public.viagem_excluir(_viagem_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _v public.viagens;
  _arquivo UUID;
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para excluir viagens';
  END IF;

  SELECT * INTO _v FROM public.viagens WHERE id = _viagem_id;
  IF _v.id IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada';
  END IF;

  INSERT INTO public.viagens_excluidas (
    viagem_id, codigo, cliente_nome, motorista_nome, veiculo_placa,
    dados, paradas, ajustes, deleted_by
  )
  VALUES (
    _v.id,
    _v.codigo,
    (SELECT c.razao_social FROM public.clientes c WHERE c.id = _v.cliente_id),
    (SELECT m.nome FROM public.motoristas m WHERE m.id = _v.motorista_id),
    (SELECT ve.placa FROM public.veiculos ve WHERE ve.id = _v.veiculo_id),
    to_jsonb(_v),
    COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.viagem_paradas p WHERE p.viagem_id = _v.id), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM public.viagem_ajustes a WHERE a.viagem_id = _v.id), '[]'::jsonb),
    auth.uid()
  )
  RETURNING id INTO _arquivo;

  DELETE FROM public.viagens WHERE id = _viagem_id;
  RETURN _arquivo;
END $$;

-- Restaura a viagem arquivada (viagem + paradas + ajustes) e remove o registro da lixeira.
CREATE OR REPLACE FUNCTION public.viagem_restaurar(_arquivo_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _arq public.viagens_excluidas;
  _v public.viagens;
BEGIN
  IF NOT private.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para restaurar viagens';
  END IF;

  SELECT * INTO _arq FROM public.viagens_excluidas WHERE id = _arquivo_id;
  IF _arq.id IS NULL THEN
    RAISE EXCEPTION 'Registro não encontrado na lixeira';
  END IF;

  IF EXISTS (SELECT 1 FROM public.viagens WHERE id = _arq.viagem_id) THEN
    DELETE FROM public.viagens_excluidas WHERE id = _arquivo_id;
    RETURN _arq.viagem_id;
  END IF;

  _v := jsonb_populate_record(NULL::public.viagens, _arq.dados);
  INSERT INTO public.viagens SELECT _v.*;

  INSERT INTO public.viagem_paradas
  SELECT (jsonb_populate_record(NULL::public.viagem_paradas, p)).*
  FROM jsonb_array_elements(_arq.paradas) p;

  INSERT INTO public.viagem_ajustes
  SELECT (jsonb_populate_record(NULL::public.viagem_ajustes, a)).*
  FROM jsonb_array_elements(_arq.ajustes) a;

  DELETE FROM public.viagens_excluidas WHERE id = _arquivo_id;
  RETURN _arq.viagem_id;
END $$;

REVOKE ALL ON FUNCTION public.viagem_excluir(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.viagem_restaurar(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.viagem_excluir(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.viagem_restaurar(UUID) TO authenticated;