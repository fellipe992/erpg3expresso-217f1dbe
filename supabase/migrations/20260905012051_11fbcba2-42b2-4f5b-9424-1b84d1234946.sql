UPDATE public.fechamentos AS f
SET periodo_inicio = DATE '2026-08-16',
    periodo_fim = DATE '2026-08-31',
    motorista_id = dados.motorista_id,
    descricao = 'Fatura SUPERFRIO ARMAZENS GERAIS S.A - DISTRIBUIÇÃO — 16/08/2026 a 31/08/2026 (10 viagens)',
    updated_at = now()
FROM (
  SELECT fv.fechamento_id, min(v.motorista_id::text)::uuid AS motorista_id
  FROM public.fechamento_viagens fv
  JOIN public.viagens v ON v.id = fv.viagem_id
  WHERE fv.ativo = true
    AND fv.fechamento_id = '085462d3-ecfc-4213-b889-ff32c586a9b5'
  GROUP BY fv.fechamento_id
  HAVING count(DISTINCT v.motorista_id) = 1
) AS dados
WHERE f.id = dados.fechamento_id
  AND f.numero = 1;