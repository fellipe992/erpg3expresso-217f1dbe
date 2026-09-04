ALTER TABLE public.fiscal_integracao_config
  ADD COLUMN IF NOT EXISTS bsoft_api_token_mdfe text,
  ADD COLUMN IF NOT EXISTS bsoft_tenant_id_mdfe text,
  ADD COLUMN IF NOT EXISTS bsoft_api_token_mdfe_homologacao text,
  ADD COLUMN IF NOT EXISTS bsoft_tenant_id_mdfe_homologacao text,
  ADD COLUMN IF NOT EXISTS bsoft_usuario_api text;

UPDATE public.fiscal_integracao_config SET
  bsoft_api_token = 'f24573f7-c83d-43ba-a725-69e8e05590c0',
  bsoft_tenant_id = '978997c3-4960-4cda-a9a0-906cd6d62677',
  bsoft_api_token_mdfe = '35635d08-7190-4b98-be97-436ba89f7a8b',
  bsoft_tenant_id_mdfe = 'c20485f4-89e0-4c1f-8651-2c2d4af118059',
  bsoft_usuario_api = 'gilberto@alphabr.com.br'
WHERE singleton = true;