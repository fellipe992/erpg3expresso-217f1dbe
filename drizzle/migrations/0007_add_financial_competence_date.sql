ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN data_competencia date;

COMMENT ON COLUMN public.financeiro_lancamentos.data_competencia IS
  'Data de competência gerencial do lançamento; vencimento e pagamento permanecem independentes.';

UPDATE public.financeiro_lancamentos
SET data_competencia = CASE
  WHEN fechamento_id IS NOT NULL THEN (
    SELECT f.periodo_fim FROM public.fechamentos f WHERE f.id = financeiro_lancamentos.fechamento_id
  )
  ELSE data_emissao
END
WHERE data_competencia IS NULL;

ALTER TABLE public.financeiro_lancamentos
  ALTER COLUMN data_competencia SET DEFAULT CURRENT_DATE;