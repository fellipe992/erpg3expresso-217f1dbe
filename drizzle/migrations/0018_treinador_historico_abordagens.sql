CREATE TABLE public.treinador_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tipo text NOT NULL,
  titulo text NOT NULL DEFAULT '',
  entrada jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.treinador_historico TO authenticated;
GRANT ALL ON public.treinador_historico TO service_role;
ALTER TABLE public.treinador_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.treinador_historico FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.treinador_historico FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.treinador_historico FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ON public.treinador_historico (user_id, created_at DESC);

CREATE TABLE public.hunter_abordagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  company_id text,
  empresa text NOT NULL,
  contato text,
  cargo text,
  segmento text,
  whatsapp text,
  email text,
  mensagens jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'em_abordagem',
  enviado_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hunter_abordagens TO authenticated;
GRANT ALL ON public.hunter_abordagens TO service_role;
ALTER TABLE public.hunter_abordagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own all" ON public.hunter_abordagens FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.hunter_abordagens (user_id, status, updated_at DESC);
CREATE TRIGGER trg_hunter_abordagens_upd BEFORE UPDATE ON public.hunter_abordagens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();