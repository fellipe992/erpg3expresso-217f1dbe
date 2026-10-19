ALTER TABLE public.telegram_destinos ADD COLUMN cliente_id uuid REFERENCES public.clientes(id);
COMMENT ON COLUMN public.telegram_destinos.cliente_id IS 'NULL = equipe interna; UUID = somente viagens deste cliente. Exclusao do cliente bloqueada enquanto houver destinatarios vinculados.';
ALTER TABLE public.notificacoes ADD COLUMN viagem_id uuid, ADD COLUMN cliente_id uuid;
COMMENT ON COLUMN public.notificacoes.cliente_id IS 'Cliente da viagem registrado no momento do alerta, para isolamento dos destinatarios externos.';
CREATE INDEX telegram_destinos_cliente_idx ON public.telegram_destinos(cliente_id);
CREATE OR REPLACE FUNCTION public.tg_notificacao_vincular_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _viagem uuid;
BEGIN
  NEW.viagem_id := NULL;
  NEW.cliente_id := NULL;
  IF NEW.origem = 'viagem' THEN
    _viagem := NEW.origem_id;
  ELSIF NEW.origem = 'parada' THEN
    SELECT viagem_id INTO _viagem FROM public.viagem_paradas WHERE id = NEW.origem_id;
  ELSIF NEW.origem = 'checklist' THEN
    SELECT viagem_id INTO _viagem FROM public.checklists WHERE id = NEW.origem_id;
  ELSIF NEW.origem = 'ocorrencia' THEN
    SELECT viagem_id INTO _viagem FROM public.viagem_ocorrencias WHERE id = NEW.origem_id;
  ELSIF NEW.origem = 'aviso' OR (NEW.origem = 'motorista' AND NEW.tipo = 'risco_motorista') THEN
    SELECT viagem_id INTO _viagem FROM public.avisos WHERE id = NEW.origem_id;
  END IF;
  SELECT id, cliente_id INTO NEW.viagem_id, NEW.cliente_id FROM public.viagens WHERE id = _viagem;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_notificacao_vincular_cliente() FROM PUBLIC;
CREATE TRIGGER trg_notificacao_vincular_cliente BEFORE INSERT ON public.notificacoes
FOR EACH ROW EXECUTE FUNCTION public.tg_notificacao_vincular_cliente();
WITH vinculos AS (
 SELECT n.id, v.id AS viagem_id, v.cliente_id FROM public.notificacoes n
 JOIN public.viagens v ON n.origem = 'viagem' AND v.id = n.origem_id
 UNION ALL
 SELECT n.id, v.id, v.cliente_id FROM public.notificacoes n JOIN public.viagem_paradas p ON n.origem = 'parada' AND p.id = n.origem_id JOIN public.viagens v ON v.id = p.viagem_id
 UNION ALL
 SELECT n.id, v.id, v.cliente_id FROM public.notificacoes n JOIN public.checklists c ON n.origem = 'checklist' AND c.id = n.origem_id JOIN public.viagens v ON v.id = c.viagem_id
 UNION ALL
 SELECT n.id, v.id, v.cliente_id FROM public.notificacoes n JOIN public.viagem_ocorrencias o ON n.origem = 'ocorrencia' AND o.id = n.origem_id JOIN public.viagens v ON v.id = o.viagem_id
 UNION ALL
 SELECT n.id, v.id, v.cliente_id FROM public.notificacoes n JOIN public.avisos a ON (n.origem = 'aviso' OR (n.origem = 'motorista' AND n.tipo = 'risco_motorista')) AND a.id = n.origem_id JOIN public.viagens v ON v.id = a.viagem_id
)
UPDATE public.notificacoes n SET viagem_id = v.viagem_id, cliente_id = v.cliente_id FROM vinculos v WHERE n.id = v.id;