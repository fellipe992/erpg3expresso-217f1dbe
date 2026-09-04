ALTER TABLE public.fiscal_documentos
  ADD COLUMN IF NOT EXISTS ambiente TEXT NOT NULL DEFAULT 'producao'
  CHECK (ambiente IN ('homologacao','producao'));

CREATE INDEX IF NOT EXISTS fiscal_documentos_ambiente_idx ON public.fiscal_documentos (ambiente);