-- Recompute KM percorridos, consumo médio e custo/km para todos abastecimentos
WITH calc AS (
  SELECT a1.id,
    (a1.km_atual - prev.km_atual) AS km_perc
  FROM public.abastecimentos a1
  LEFT JOIN LATERAL (
    SELECT km_atual FROM public.abastecimentos a2
    WHERE a2.veiculo_id = a1.veiculo_id
      AND (a2.data < a1.data OR (a2.data = a1.data AND (a2.hora IS NULL OR a2.hora < COALESCE(a1.hora, '23:59'::time))))
      AND a2.id <> a1.id
      AND a2.km_atual < a1.km_atual
    ORDER BY a2.data DESC, a2.hora DESC NULLS LAST
    LIMIT 1
  ) prev ON TRUE
)
UPDATE public.abastecimentos a
SET km_percorridos = c.km_perc,
    consumo_medio  = CASE WHEN a.litros > 0 AND c.km_perc IS NOT NULL AND c.km_perc > 0
                          THEN ROUND((c.km_perc / a.litros)::numeric, 2) ELSE NULL END,
    custo_por_km   = CASE WHEN c.km_perc IS NOT NULL AND c.km_perc > 0
                          THEN ROUND((a.valor_total / c.km_perc)::numeric, 3) ELSE NULL END
FROM calc c
WHERE a.id = c.id
  AND a.km_percorridos IS DISTINCT FROM c.km_perc;
