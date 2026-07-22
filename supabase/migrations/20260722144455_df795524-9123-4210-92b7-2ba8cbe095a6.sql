
-- Notificações do sistema
CREATE TABLE public.notificacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'info',
  titulo TEXT NOT NULL,
  mensagem TEXT,
  link TEXT,
  origem TEXT,
  origem_id UUID,
  lida_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notificacoes_user ON public.notificacoes(user_id, created_at DESC);
CREATE INDEX idx_notificacoes_unread ON public.notificacoes(user_id) WHERE lida_em IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;

ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários leem suas próprias notificações"
  ON public.notificacoes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários marcam suas notificações como lidas"
  ON public.notificacoes FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários excluem suas notificações"
  ON public.notificacoes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Sem policy de INSERT para clients: apenas triggers SECURITY DEFINER podem criar.

ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;

-- Trigger: notifica motorista quando é atrelado a uma viagem
CREATE OR REPLACE FUNCTION public.tg_viagem_notificar_motorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _placa TEXT;
  _titulo TEXT;
  _msg TEXT;
BEGIN
  IF NEW.motorista_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.motorista_id IS NOT DISTINCT FROM OLD.motorista_id THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO _user_id FROM public.motoristas WHERE id = NEW.motorista_id;
  IF _user_id IS NULL THEN RETURN NEW; END IF;

  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;

  _titulo := 'Nova viagem atribuída';
  _msg := 'OS ' || COALESCE(NEW.codigo, '') ||
          COALESCE(' • ' || _placa, '') ||
          COALESCE(' • ' || NEW.origem_cidade || '/' || NEW.origem_uf, '') ||
          COALESCE(' → ' || NEW.destino_cidade || '/' || NEW.destino_uf, '');

  INSERT INTO public.notificacoes (user_id, tipo, titulo, mensagem, link, origem, origem_id)
  VALUES (_user_id, 'viagem', _titulo, _msg, '/app/viagens/' || NEW.id::text, 'viagem', NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_viagem_notif_ins
AFTER INSERT ON public.viagens
FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_notificar_motorista();

CREATE TRIGGER trg_viagem_notif_upd
AFTER UPDATE OF motorista_id ON public.viagens
FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_notificar_motorista();
