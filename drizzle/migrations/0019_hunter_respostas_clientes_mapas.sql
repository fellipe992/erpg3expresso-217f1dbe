ALTER TABLE public.hunter_abordagens
  ADD COLUMN IF NOT EXISTS resposta_cliente text,
  ADD COLUMN IF NOT EXISTS respondido_em timestamptz,
  ADD COLUMN IF NOT EXISTS canal_envio text,
  ADD COLUMN IF NOT EXISTS cliente_id uuid;

CREATE POLICY "admin select all abordagens" ON public.hunter_abordagens
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'administrador'::app_role));

CREATE TABLE public.hunter_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  empresa text NOT NULL,
  segmento text,
  tipo_frete text,
  contato text,
  cargo text,
  telefone text,
  email text,
  cidade text,
  observacao text,
  ultima_abordagem_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hunter_clientes TO authenticated;
GRANT ALL ON public.hunter_clientes TO service_role;
ALTER TABLE public.hunter_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own all clientes" ON public.hunter_clientes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin select clientes" ON public.hunter_clientes FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'administrador'::app_role));
CREATE TRIGGER hunter_clientes_updated BEFORE UPDATE ON public.hunter_clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "treinador mapas own read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'treinador-mapas' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "treinador mapas own insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'treinador-mapas' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "treinador mapas own delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'treinador-mapas' AND (storage.foldername(name))[1] = auth.uid()::text);