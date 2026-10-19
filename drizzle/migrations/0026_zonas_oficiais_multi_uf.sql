-- Permite regiões de roubo de carga de outros estados (RJ, MG, PR, etc.)
ALTER TABLE public.zonas_oficiais_ssp_regioes ADD COLUMN IF NOT EXISTS uf text NOT NULL DEFAULT 'SP';

-- Recalcula as zonas oficiais de roubo de carga por estado:
-- cada UF tem sua própria janela de 3 anos e o nível é comparado à média nacional.
CREATE OR REPLACE FUNCTION public.recalcular_zonas_oficiais()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _cur integer; _n_prf integer := 0; _n_ssp integer := 0;
BEGIN
  SELECT max(ano) INTO _cur FROM zonas_oficiais_prf_celulas;
  IF _cur IS NOT NULL THEN
    WITH s AS (
      SELECT chave, avg(lat) lat, avg(lng) lng,
        (array_agg(uf ORDER BY ano DESC))[1] uf, (array_agg(br ORDER BY ano DESC))[1] br,
        (array_agg(km ORDER BY ano DESC))[1] km, (array_agg(municipio ORDER BY ano DESC))[1] municipio,
        sum(pontos * CASE _cur - ano WHEN 0 THEN 1 WHEN 1 THEN 0.7 ELSE 0.4 END) indice,
        sum(acidentes)::int ac, sum(com_feridos)::int fe, sum(com_mortos)::int mo
      FROM zonas_oficiais_prf_celulas WHERE ano >= _cur - 2 GROUP BY chave
    ), r AS (SELECT *, percent_rank() OVER (ORDER BY indice) pr FROM s),
    sel AS (SELECT * FROM r WHERE pr >= 0.85),
    up AS (
      INSERT INTO zonas_risco (nome, tipo, nivel, lat, lng, raio_m, uf, cidade, recomendacao, origem, ativo,
        chave, indice, ocorrencias, periodo, atualizado_em)
      SELECT 'BR-' || coalesce(br, '?') || ' km ' || coalesce(km, '?') || ' · ' || coalesce(municipio, '') || '/' || coalesce(uf, ''),
        'acidente', CASE WHEN pr >= 0.97 THEN 4 ELSE 3 END, lat, lng, 1500, uf, municipio,
        ac || ' acidentes (' || fe || ' com feridos, ' || mo || ' com mortos) entre ' || (_cur - 2) || ' e ' || _cur || '. Reduzir velocidade e redobrar atenção.',
        'prf', true, chave, round(indice, 1), ac, 'PRF ' || (_cur - 2) || '–' || _cur, now()
      FROM sel
      ON CONFLICT (origem, chave) WHERE chave IS NOT NULL DO UPDATE SET
        nome = EXCLUDED.nome, nivel = EXCLUDED.nivel, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
        recomendacao = EXCLUDED.recomendacao, indice = EXCLUDED.indice, ocorrencias = EXCLUDED.ocorrencias,
        periodo = EXCLUDED.periodo, atualizado_em = now()
      RETURNING chave
    )
    SELECT count(*) INTO _n_prf FROM up;
    -- Áreas que saíram do grupo de maior risco deixam de aparecer (não são apagadas).
    UPDATE zonas_risco SET ativo = false WHERE origem = 'prf' AND (atualizado_em IS NULL OR atualizado_em < now() - interval '1 minute');
  END IF;

  -- Roubo de carga: janela de 3 anos por UF; nível comparado à média nacional.
  IF EXISTS (SELECT 1 FROM zonas_oficiais_ssp_anos) THEN
    WITH cur AS (
      SELECT g.uf, max(a.ano) ano
      FROM zonas_oficiais_ssp_anos a JOIN zonas_oficiais_ssp_regioes g ON g.gid = a.gid
      GROUP BY g.uf
    ), t AS (
      SELECT a.gid, g.uf, c.ano cur,
        sum(a.roubos * CASE c.ano - a.ano WHEN 0 THEN 1 WHEN 1 THEN 0.7 ELSE 0.4 END)
          / nullif(sum(a.populacao * CASE c.ano - a.ano WHEN 0 THEN 1 WHEN 1 THEN 0.7 ELSE 0.4 END), 0) * 100000 tx,
        sum(a.roubos)::int roubos
      FROM zonas_oficiais_ssp_anos a
      JOIN zonas_oficiais_ssp_regioes g ON g.gid = a.gid
      JOIN cur c ON c.uf = g.uf
      WHERE a.ano >= c.ano - 2 AND a.populacao > 0
      GROUP BY a.gid, g.uf, c.ano
    ), m AS (
      SELECT sum(roubos)::numeric / nullif(sum(pop), 0) * 100000 media
      FROM (
        SELECT a.gid, sum(a.roubos * CASE c.ano - a.ano WHEN 0 THEN 1 WHEN 1 THEN 0.7 ELSE 0.4 END) roubos,
          sum(a.populacao * CASE c.ano - a.ano WHEN 0 THEN 1 WHEN 1 THEN 0.7 ELSE 0.4 END) pop
        FROM zonas_oficiais_ssp_anos a
        JOIN zonas_oficiais_ssp_regioes g ON g.gid = a.gid
        JOIN cur c ON c.uf = g.uf
        WHERE a.ano >= c.ano - 2 AND a.populacao > 0
        GROUP BY a.gid
      ) x
    ), up AS (
      INSERT INTO zonas_risco (nome, tipo, nivel, lat, lng, raio_m, uf, cidade, recomendacao, origem, ativo,
        chave, indice, ocorrencias, periodo, atualizado_em)
      SELECT 'Região de ' || g.nome || ' (roubo de carga)', 'roubo',
        CASE WHEN t.tx >= 2 * m.media THEN 4 WHEN t.tx >= m.media THEN 3 WHEN t.tx >= 0.5 * m.media THEN 2 ELSE 1 END,
        g.lat, g.lng, g.raio_m, g.uf, g.nome,
        t.roubos || ' roubos de carga registrados entre ' || (t.cur - 2) || ' e ' || t.cur || ' (' || round(t.tx, 1) || ' por 100 mil hab./ano). Média nacional: ' || round(m.media, 1) || '.',
        'ssp', true, 'ra_' || g.gid, round(t.tx, 2), t.roubos, 'Oficial ' || g.uf || ' ' || (t.cur - 2) || '–' || t.cur, now()
      FROM t JOIN zonas_oficiais_ssp_regioes g ON g.gid = t.gid CROSS JOIN m
      ON CONFLICT (origem, chave) WHERE chave IS NOT NULL DO UPDATE SET
        nivel = EXCLUDED.nivel, recomendacao = EXCLUDED.recomendacao, indice = EXCLUDED.indice,
        ocorrencias = EXCLUDED.ocorrencias, periodo = EXCLUDED.periodo, atualizado_em = now()
      RETURNING chave
    )
    SELECT count(*) INTO _n_ssp FROM up;
  END IF;

  RETURN jsonb_build_object('prf', _n_prf, 'ssp', _n_ssp);
END $function$;