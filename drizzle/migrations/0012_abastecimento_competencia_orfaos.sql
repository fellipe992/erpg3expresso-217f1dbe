UPDATE public.financeiro_lancamentos SET data_competencia = public.quinzena_fim(data_emissao)
WHERE origem='abastecimento' AND data_competencia IS NULL AND data_emissao IS NOT NULL;