ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS rntrc text,
  ADD COLUMN IF NOT EXISTS endereco_numero text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS cep text;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS endereco_numero text,
  ADD COLUMN IF NOT EXISTS bairro text;