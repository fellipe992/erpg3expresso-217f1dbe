ALTER TABLE public.viagens
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric,
  ADD COLUMN IF NOT EXISTS comissao_valor numeric,
  ADD COLUMN IF NOT EXISTS provisao_manutencao_km numeric,
  ADD COLUMN IF NOT EXISTS provisao_pneus_km numeric,
  ADD COLUMN IF NOT EXISTS pedagio_estimado numeric,
  ADD COLUMN IF NOT EXISTS outros_custos_estimados numeric,
  ADD COLUMN IF NOT EXISTS distancia_estimada_km numeric;