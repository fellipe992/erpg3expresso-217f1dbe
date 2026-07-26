CREATE EXTENSION IF NOT EXISTS pg_cron;

REVOKE EXECUTE ON FUNCTION public.marcar_atrasados() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.gerar_notificacoes_alertas() FROM authenticated, anon, PUBLIC;

SELECT cron.unschedule('g3-marcar-atrasados') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='g3-marcar-atrasados');
SELECT cron.unschedule('g3-gerar-alertas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='g3-gerar-alertas');

SELECT cron.schedule('g3-marcar-atrasados', '5 * * * *', $$
  UPDATE public.financeiro_lancamentos
    SET status='atrasado'
    WHERE status='pendente' AND data_vencimento IS NOT NULL AND data_vencimento < CURRENT_DATE;
  UPDATE public.financeiro_lancamentos
    SET status='pendente'
    WHERE status='atrasado' AND (data_vencimento IS NULL OR data_vencimento >= CURRENT_DATE);
$$);

SELECT cron.schedule('g3-gerar-alertas', '15 * * * *', $$ SELECT public.gerar_notificacoes_alertas(); $$);