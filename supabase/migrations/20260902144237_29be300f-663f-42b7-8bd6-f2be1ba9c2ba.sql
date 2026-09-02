DROP TRIGGER IF EXISTS trg_viagem_financeiro ON public.viagens;
CREATE TRIGGER trg_viagem_financeiro
AFTER INSERT OR UPDATE OF status, valor_frete, cliente_id, data_prevista_chegada, data_chegada, pedagio_cliente, frete_faixa_id, usar_tabela_cliente
ON public.viagens FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_financeiro();