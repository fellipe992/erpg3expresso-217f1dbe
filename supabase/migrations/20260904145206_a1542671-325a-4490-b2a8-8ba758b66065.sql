ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS emitente_fiscal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emitente_padrao BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.fiscal_documentos
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.company_settings(id) ON DELETE SET NULL;

ALTER TABLE public.fiscal_ciots
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES public.company_settings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_documentos_empresa ON public.fiscal_documentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_ciots_empresa ON public.fiscal_ciots(empresa_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_settings_emitente_padrao
  ON public.company_settings(emitente_padrao) WHERE emitente_padrao;