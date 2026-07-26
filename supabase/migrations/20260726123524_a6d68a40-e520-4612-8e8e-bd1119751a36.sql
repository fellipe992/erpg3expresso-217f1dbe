CREATE INDEX IF NOT EXISTS idx_fin_veiculo ON public.financeiro_lancamentos (veiculo_id);
CREATE INDEX IF NOT EXISTS idx_fin_motorista ON public.financeiro_lancamentos (motorista_id);
CREATE INDEX IF NOT EXISTS idx_fin_emissao ON public.financeiro_lancamentos (data_emissao);
CREATE INDEX IF NOT EXISTS idx_viagens_cliente ON public.viagens (cliente_id);
CREATE INDEX IF NOT EXISTS idx_viagens_veiculo ON public.viagens (veiculo_id);
CREATE INDEX IF NOT EXISTS idx_viagens_saida ON public.viagens (data_saida DESC);
CREATE INDEX IF NOT EXISTS idx_viagens_created ON public.viagens (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abast_viagem ON public.abastecimentos (viagem_id);
CREATE INDEX IF NOT EXISTS idx_manut_viagem ON public.manutencoes (viagem_id);