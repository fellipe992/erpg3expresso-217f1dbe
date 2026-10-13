DROP TRIGGER IF EXISTS pedido_posicao_notificar ON public.avisos;
DELETE FROM public.notificacoes WHERE tipo = 'pedido_posicao';