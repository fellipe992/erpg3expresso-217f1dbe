CREATE TABLE IF NOT EXISTS public.paginas_monitoradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  url text NOT NULL,
  categoria text NOT NULL DEFAULT 'regulador' CHECK (categoria IN ('concorrente', 'regulador')),
  ultimo_conteudo text,
  ultimo_diff text,
  teve_alteracao boolean NOT NULL DEFAULT false,
  ultima_verificacao_em timestamptz,
  alterado_em timestamptz,
  ultimo_erro text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paginas_monitoradas TO authenticated;
GRANT ALL ON public.paginas_monitoradas TO service_role;

ALTER TABLE public.paginas_monitoradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ler paginas monitoradas"
  ON public.paginas_monitoradas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Autenticados podem inserir paginas monitoradas"
  ON public.paginas_monitoradas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar paginas monitoradas"
  ON public.paginas_monitoradas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Autenticados podem remover paginas monitoradas"
  ON public.paginas_monitoradas FOR DELETE
  TO authenticated
  USING (true);