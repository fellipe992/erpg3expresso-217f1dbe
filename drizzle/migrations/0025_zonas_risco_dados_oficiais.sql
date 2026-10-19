ALTER TABLE public.zonas_risco
  ADD COLUMN IF NOT EXISTS chave text,
  ADD COLUMN IF NOT EXISTS indice numeric,
  ADD COLUMN IF NOT EXISTS ocorrencias integer,
  ADD COLUMN IF NOT EXISTS periodo text,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS zonas_risco_origem_chave_uk ON public.zonas_risco (origem, chave) WHERE chave IS NOT NULL;

-- Acidentes PRF agregados por área (~2 km) e ano.
CREATE TABLE public.zonas_oficiais_prf_celulas (
  ano integer NOT NULL,
  chave text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  uf text, br text, km text, municipio text,
  acidentes integer NOT NULL DEFAULT 0,
  com_feridos integer NOT NULL DEFAULT 0,
  com_mortos integer NOT NULL DEFAULT 0,
  pontos numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (ano, chave)
);
GRANT ALL ON public.zonas_oficiais_prf_celulas TO service_role;
ALTER TABLE public.zonas_oficiais_prf_celulas ENABLE ROW LEVEL SECURITY;

-- Roubo de carga SSP-SP/SEADE por região administrativa e ano.
CREATE TABLE public.zonas_oficiais_ssp_regioes (
  gid integer PRIMARY KEY,
  nome text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  raio_m integer NOT NULL
);
CREATE TABLE public.zonas_oficiais_ssp_anos (
  ano integer NOT NULL,
  gid integer NOT NULL,
  roubos integer NOT NULL,
  populacao integer,
  PRIMARY KEY (ano, gid)
);
GRANT ALL ON public.zonas_oficiais_ssp_regioes TO service_role;
GRANT ALL ON public.zonas_oficiais_ssp_anos TO service_role;
ALTER TABLE public.zonas_oficiais_ssp_regioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas_oficiais_ssp_anos ENABLE ROW LEVEL SECURITY;

-- Histórico das atualizações.
CREATE TABLE public.zonas_risco_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte text NOT NULL,
  referencia text,
  status text NOT NULL DEFAULT 'ok',
  linhas integer,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.zonas_risco_importacoes TO authenticated;
GRANT ALL ON public.zonas_risco_importacoes TO service_role;
ALTER TABLE public.zonas_risco_importacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY importacoes_select_admin ON public.zonas_risco_importacoes FOR SELECT TO authenticated
  USING (public.get_primary_role(auth.uid()) = 'administrador');

-- Recalcula as zonas oficiais. Nunca toca nas zonas G3 nem nas dos motoristas.
CREATE OR REPLACE FUNCTION public.recalcular_zonas_oficiais()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur integer; _n_prf integer := 0; _n_ssp integer := 0; _cur_ssp integer;
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

  SELECT max(ano) INTO _cur_ssp FROM zonas_oficiais_ssp_anos;
  IF _cur_ssp IS NOT NULL THEN
    WITH t AS (
      SELECT a.gid,
        sum(a.roubos * CASE _cur_ssp - a.ano WHEN 0 THEN 1 WHEN 1 THEN 0.7 ELSE 0.4 END)
          / nullif(sum(a.populacao * CASE _cur_ssp - a.ano WHEN 0 THEN 1 WHEN 1 THEN 0.7 ELSE 0.4 END), 0) * 100000 tx,
        sum(a.roubos)::int roubos
      FROM zonas_oficiais_ssp_anos a WHERE a.ano >= _cur_ssp - 2 AND a.populacao > 0 GROUP BY a.gid
    ), m AS (SELECT sum(roubos)::numeric / nullif((SELECT sum(populacao) FROM zonas_oficiais_ssp_anos WHERE ano >= _cur_ssp - 2 AND populacao > 0), 0) * 100000 * 0 + avg(tx) media FROM t),
    up AS (
      INSERT INTO zonas_risco (nome, tipo, nivel, lat, lng, raio_m, uf, cidade, recomendacao, origem, ativo,
        chave, indice, ocorrencias, periodo, atualizado_em)
      SELECT 'Região de ' || g.nome || ' (roubo de carga)', 'roubo',
        CASE WHEN t.tx >= 2 * m.media THEN 4 WHEN t.tx >= m.media THEN 3 WHEN t.tx >= 0.5 * m.media THEN 2 ELSE 1 END,
        g.lat, g.lng, g.raio_m, 'SP', g.nome,
        t.roubos || ' roubos de carga registrados entre ' || (_cur_ssp - 2) || ' e ' || _cur_ssp || ' (' || round(t.tx, 1) || ' por 100 mil hab./ano). Média regional do estado: ' || round(m.media, 1) || '.',
        'ssp', true, 'ra_' || g.gid, round(t.tx, 2), t.roubos, 'SSP-SP ' || (_cur_ssp - 2) || '–' || _cur_ssp, now()
      FROM t JOIN zonas_oficiais_ssp_regioes g ON g.gid = t.gid CROSS JOIN m
      ON CONFLICT (origem, chave) WHERE chave IS NOT NULL DO UPDATE SET
        nivel = EXCLUDED.nivel, recomendacao = EXCLUDED.recomendacao, indice = EXCLUDED.indice,
        ocorrencias = EXCLUDED.ocorrencias, periodo = EXCLUDED.periodo, atualizado_em = now()
      RETURNING chave
    )
    SELECT count(*) INTO _n_ssp FROM up;
  END IF;

  RETURN jsonb_build_object('prf', _n_prf, 'ssp', _n_ssp);
END $$;
REVOKE ALL ON FUNCTION public.recalcular_zonas_oficiais() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_zonas_oficiais() TO service_role;