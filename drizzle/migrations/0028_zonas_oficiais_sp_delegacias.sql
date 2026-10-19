CREATE TABLE public.zonas_oficiais_ssp_dp (
  id_distrito integer PRIMARY KEY,
  nome text NOT NULL,
  bairro text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  raio_m integer NOT NULL DEFAULT 1800
);
CREATE TABLE public.zonas_oficiais_ssp_dp_anos (
  id_distrito integer NOT NULL REFERENCES public.zonas_oficiais_ssp_dp(id_distrito) ON DELETE CASCADE,
  ano integer NOT NULL,
  roubo_carga integer NOT NULL DEFAULT 0,
  roubo_veiculo integer NOT NULL DEFAULT 0,
  roubo_outros integer NOT NULL DEFAULT 0,
  latrocinio integer NOT NULL DEFAULT 0,
  transito_mortes integer NOT NULL DEFAULT 0,
  transito_feridos integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id_distrito, ano)
);
GRANT SELECT ON public.zonas_oficiais_ssp_dp, public.zonas_oficiais_ssp_dp_anos TO authenticated;
GRANT ALL ON public.zonas_oficiais_ssp_dp, public.zonas_oficiais_ssp_dp_anos TO service_role;
ALTER TABLE public.zonas_oficiais_ssp_dp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas_oficiais_ssp_dp_anos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ssp_dp_select ON public.zonas_oficiais_ssp_dp FOR SELECT TO authenticated USING (true);
CREATE POLICY ssp_dp_anos_select ON public.zonas_oficiais_ssp_dp_anos FOR SELECT TO authenticated USING (true);

ALTER FUNCTION public.recalcular_zonas_oficiais() RENAME TO recalcular_zonas_oficiais_base;
REVOKE ALL ON FUNCTION public.recalcular_zonas_oficiais_base() FROM PUBLIC, anon, authenticated;

-- Capital SP por delegacia (SSP-SP): roubo de carga pesa mais; nível por posição relativa entre as delegacias.
CREATE OR REPLACE FUNCTION public.recalcular_zonas_oficiais()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _base jsonb; _cur integer; _n integer := 0;
BEGIN
  _base := recalcular_zonas_oficiais_base();
  SELECT max(ano) INTO _cur FROM zonas_oficiais_ssp_dp_anos;
  IF _cur IS NOT NULL THEN
    WITH s AS (
      SELECT a.id_distrito, min(a.ano) ini,
        sum((a.roubo_carga * 10 + a.roubo_veiculo + a.latrocinio * 20 + a.roubo_outros * 0.05
             + a.transito_mortes * 5 + a.transito_feridos * 0.5)
            * CASE _cur - a.ano WHEN 0 THEN 1 WHEN 1 THEN 0.7 ELSE 0.4 END) indice,
        sum(a.roubo_carga)::int rc, sum(a.roubo_veiculo)::int rv, sum(a.latrocinio)::int la,
        sum(a.transito_mortes)::int tm
      FROM zonas_oficiais_ssp_dp_anos a WHERE a.ano >= _cur - 2 GROUP BY a.id_distrito
    ), r AS (SELECT *, percent_rank() OVER (ORDER BY indice) pr FROM s),
    up AS (
      INSERT INTO zonas_risco (nome, tipo, nivel, lat, lng, raio_m, uf, cidade, bairro, recomendacao, origem, ativo,
        chave, indice, ocorrencias, periodo, atualizado_em)
      SELECT upper(d.bairro) || ' · ' || d.nome, 'roubo',
        CASE WHEN r.pr >= 0.9 THEN 4 WHEN r.pr >= 0.65 THEN 3 WHEN r.pr >= 0.3 THEN 2 ELSE 1 END,
        d.lat, d.lng, d.raio_m, 'SP', 'SÃO PAULO', upper(d.bairro),
        r.rc || ' roubos de carga, ' || r.rv || ' roubos de veículo, ' || r.la || ' latrocínios e ' || r.tm || ' mortes no trânsito entre ' || r.ini || ' e ' || _cur || ' (SSP-SP, área da delegacia).'
          || CASE WHEN r.pr >= 0.65 THEN ' Evitar paradas, não aguardar na rua e manter contato com o monitoramento.' ELSE '' END,
        'ssp_dp', true, 'dp_' || d.id_distrito, round(r.indice::numeric, 1), r.rc, 'SSP-SP ' || r.ini || '–' || _cur, now()
      FROM r JOIN zonas_oficiais_ssp_dp d ON d.id_distrito = r.id_distrito
      ON CONFLICT (origem, chave) WHERE chave IS NOT NULL DO UPDATE SET
        nome = EXCLUDED.nome, nivel = EXCLUDED.nivel, lat = EXCLUDED.lat, lng = EXCLUDED.lng, bairro = EXCLUDED.bairro,
        recomendacao = EXCLUDED.recomendacao, indice = EXCLUDED.indice, ocorrencias = EXCLUDED.ocorrencias,
        periodo = EXCLUDED.periodo, ativo = true, atualizado_em = now()
      RETURNING chave
    )
    SELECT count(*) INTO _n FROM up;
  END IF;
  RETURN _base || jsonb_build_object('ssp_dp', _n);
END $function$;
REVOKE ALL ON FUNCTION public.recalcular_zonas_oficiais() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_zonas_oficiais() TO service_role;