CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  plataforma text NOT NULL DEFAULT 'web',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_tokens_own ON public.push_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.telegram_destinos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  chat_id bigint NOT NULL UNIQUE,
  categorias text[] NOT NULL DEFAULT ARRAY['viagem','monitoramento'],
  somente_alta boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_destinos TO authenticated;
GRANT ALL ON public.telegram_destinos TO service_role;
ALTER TABLE public.telegram_destinos ENABLE ROW LEVEL SECURITY;
CREATE POLICY telegram_destinos_admin ON public.telegram_destinos FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor'))
  WITH CHECK (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor'));

CREATE TABLE public.telegram_chats_detectados (
  chat_id bigint PRIMARY KEY,
  titulo text,
  tipo text,
  ultimo_texto text,
  visto_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.telegram_chats_detectados TO authenticated;
GRANT ALL ON public.telegram_chats_detectados TO service_role;
ALTER TABLE public.telegram_chats_detectados ENABLE ROW LEVEL SECURITY;
CREATE POLICY telegram_chats_admin ON public.telegram_chats_detectados FOR ALL TO authenticated
  USING (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor'));

CREATE TABLE public.alertas_externos_fila (
  id bigserial PRIMARY KEY,
  notificacao_id uuid NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  tentativas int NOT NULL DEFAULT 0,
  erro text
);
GRANT ALL ON public.alertas_externos_fila TO service_role;
GRANT USAGE ON SEQUENCE public.alertas_externos_fila_id_seq TO service_role;
ALTER TABLE public.alertas_externos_fila ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_enviados (
  chave text NOT NULL,
  chat_id bigint NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chave, chat_id)
);
GRANT ALL ON public.telegram_enviados TO service_role;
ALTER TABLE public.telegram_enviados ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.tg_notificacao_alerta_externo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  INSERT INTO public.alertas_externos_fila(notificacao_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  BEGIN
    PERFORM net.http_post(
      url := 'https://project--ff821eca-162f-4b3a-b7ff-749214f5fc69.lovable.app/api/public/hooks/alertas-externos',
      body := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notificacao_alerta_externo AFTER INSERT ON public.notificacoes
FOR EACH ROW EXECUTE FUNCTION private.tg_notificacao_alerta_externo();