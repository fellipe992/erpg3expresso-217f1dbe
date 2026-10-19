CREATE TABLE public.cliente_contatos_whatsapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cargo text,
  telefone text NOT NULL,
  eventos text[] NOT NULL DEFAULT ARRAY['inicio_viagem','a_caminho','entrega_concluida','fim_viagem','zona_risco','alerta_motorista','posicao']::text[],
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.cliente_contatos_whatsapp (cliente_id);
CREATE INDEX ON public.cliente_contatos_whatsapp (telefone);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cliente_contatos_whatsapp TO authenticated;
GRANT ALL ON public.cliente_contatos_whatsapp TO service_role;
ALTER TABLE public.cliente_contatos_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY ccw_staff_all ON public.cliente_contatos_whatsapp FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()) OR private.is_monitor(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY ccw_motorista_select ON public.cliente_contatos_whatsapp FOR SELECT TO authenticated
  USING (ativo AND EXISTS (SELECT 1 FROM public.viagens v WHERE v.cliente_id = cliente_contatos_whatsapp.cliente_id AND v.status = 'em_andamento' AND v.motorista_id = private.current_motorista_id()));

CREATE TABLE public.whatsapp_contatos_internos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_contatos_internos TO authenticated;
GRANT ALL ON public.whatsapp_contatos_internos TO service_role;
ALTER TABLE public.whatsapp_contatos_internos ENABLE ROW LEVEL SECURITY;
CREATE POLICY wci_staff ON public.whatsapp_contatos_internos FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.whatsapp_webhook_events (next_attempt_at) WHERE processed_at IS NULL;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY wwe_staff_select ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE TABLE public.whatsapp_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direcao text NOT NULL,
  telefone text NOT NULL,
  wamid text UNIQUE,
  contexto_wamid text,
  tipo text NOT NULL DEFAULT 'text',
  texto text,
  evento text,
  status text NOT NULL DEFAULT 'accepted',
  status_em jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro text,
  viagem_id uuid,
  motorista_id uuid,
  cliente_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.whatsapp_mensagens (telefone, created_at DESC);
GRANT SELECT ON public.whatsapp_mensagens TO authenticated;
GRANT ALL ON public.whatsapp_mensagens TO service_role;
ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY wm_staff_select ON public.whatsapp_mensagens FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) OR private.is_monitor(auth.uid()));

CREATE TABLE public.whatsapp_status_eventos (
  wamid text NOT NULL,
  status text NOT NULL,
  ocorrido_em timestamptz NOT NULL,
  erros jsonb,
  PRIMARY KEY (wamid, status)
);
GRANT ALL ON public.whatsapp_status_eventos TO service_role;
ALTER TABLE public.whatsapp_status_eventos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.motorista_chat_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL,
  viagem_id uuid,
  destino text NOT NULL DEFAULT 'g3',
  contato_id uuid,
  telefone text,
  contato_nome text,
  autor text NOT NULL,
  autor_user_id uuid,
  texto text NOT NULL,
  wamid text,
  envio_erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.motorista_chat_mensagens (motorista_id, created_at DESC);
CREATE INDEX ON public.motorista_chat_mensagens (telefone, created_at DESC);
CREATE INDEX ON public.motorista_chat_mensagens (wamid);
GRANT SELECT ON public.motorista_chat_mensagens TO authenticated;
GRANT ALL ON public.motorista_chat_mensagens TO service_role;
ALTER TABLE public.motorista_chat_mensagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcm_staff_select ON public.motorista_chat_mensagens FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) OR private.is_monitor(auth.uid()));
CREATE POLICY mcm_motorista_select ON public.motorista_chat_mensagens FOR SELECT TO authenticated
  USING (motorista_id = private.current_motorista_id());
ALTER PUBLICATION supabase_realtime ADD TABLE public.motorista_chat_mensagens;

-- Security: official SP district aggregates are only read by the server recalculation.
DROP POLICY IF EXISTS ssp_dp_select ON public.zonas_oficiais_ssp_dp;
DROP POLICY IF EXISTS ssp_dp_anos_select ON public.zonas_oficiais_ssp_dp_anos;
CREATE POLICY ssp_dp_select_staff ON public.zonas_oficiais_ssp_dp FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY ssp_dp_anos_select_staff ON public.zonas_oficiais_ssp_dp_anos FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));