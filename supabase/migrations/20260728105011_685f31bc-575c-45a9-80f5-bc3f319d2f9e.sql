ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS provisao_manutencao_km numeric,
  ADD COLUMN IF NOT EXISTS provisao_pneus_km numeric;