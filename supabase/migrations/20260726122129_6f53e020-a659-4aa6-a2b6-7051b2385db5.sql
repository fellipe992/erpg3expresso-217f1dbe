REVOKE ALL ON FUNCTION public.tg_viagem_notificar_eventos() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_notificacoes_alertas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_notificacoes_alertas() TO authenticated;

CREATE OR REPLACE FUNCTION public.gerar_notificacoes_alertas()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; _dias INT;
BEGIN
  FOR r IN SELECT m.id, m.user_id, m.cnh_validade FROM public.motoristas m
           WHERE m.ativo AND m.user_id IS NOT NULL AND m.cnh_validade IS NOT NULL
             AND m.cnh_validade <= CURRENT_DATE + 30 LOOP
    _dias := r.cnh_validade - CURRENT_DATE;
    PERFORM private.notificar(r.user_id,'documento','cnh_vencimento',
      CASE WHEN _dias < 0 THEN 'CNH vencida' ELSE 'CNH vence em ' || _dias || ' dias' END,
      'Validade: ' || to_char(r.cnh_validade,'DD/MM/YYYY'),
      '/app/alertas','motorista',r.id, CASE WHEN _dias < 0 THEN 'alta' ELSE 'normal' END, 168);
  END LOOP;

  FOR r IN
    SELECT v.id, v.placa, d.rotulo, d.validade, m.user_id
      FROM public.veiculos v
      CROSS JOIN LATERAL (VALUES
        ('Licenciamento', v.licenciamento_validade),
        ('Seguro', v.seguro_validade),
        ('CRLV / documento', v.crlv_validade)) AS d(rotulo, validade)
      LEFT JOIN public.motoristas m ON m.veiculo_id = v.id AND m.ativo AND m.user_id IS NOT NULL
     WHERE v.ativo AND d.validade IS NOT NULL AND d.validade <= CURRENT_DATE + 30
  LOOP
    _dias := r.validade - CURRENT_DATE;
    PERFORM private.notificar(r.user_id,'documento','doc_veiculo_vencimento',
      r.rotulo || CASE WHEN _dias < 0 THEN ' vencido' ELSE ' vence em ' || _dias || ' dias' END,
      'Veículo ' || r.placa || ' • ' || to_char(r.validade,'DD/MM/YYYY'),
      '/app/veiculos','veiculo',r.id, CASE WHEN _dias < 0 THEN 'alta' ELSE 'normal' END, 168);
  END LOOP;

  FOR r IN SELECT mn.id, mn.tipo, mn.proxima_revisao_data, v.placa, m.user_id
             FROM public.manutencoes mn
             JOIN public.veiculos v ON v.id = mn.veiculo_id
             LEFT JOIN public.motoristas m ON m.veiculo_id = mn.veiculo_id AND m.ativo AND m.user_id IS NOT NULL
            WHERE mn.proxima_revisao_data IS NOT NULL
              AND mn.proxima_revisao_data <= CURRENT_DATE + 15 LOOP
    _dias := r.proxima_revisao_data - CURRENT_DATE;
    PERFORM private.notificar(r.user_id,'manutencao','manutencao_agendada',
      r.tipo || CASE WHEN _dias < 0 THEN ' atrasada' ELSE ' em ' || _dias || ' dias' END,
      'Veículo ' || r.placa || ' • ' || to_char(r.proxima_revisao_data,'DD/MM/YYYY'),
      '/app/manutencoes','manutencao',r.id, CASE WHEN _dias < 0 THEN 'alta' ELSE 'normal' END, 168);
  END LOOP;

  FOR r IN SELECT ur.user_id, count(*) AS qtd, sum(f.valor) AS total
             FROM public.financeiro_lancamentos f
             CROSS JOIN (SELECT DISTINCT user_id FROM public.user_roles
                          WHERE role IN ('administrador','financeiro')) ur
            WHERE f.status IN ('pendente','atrasado')
              AND f.data_vencimento IS NOT NULL
              AND f.data_vencimento <= CURRENT_DATE + 3
            GROUP BY ur.user_id LOOP
    PERFORM private.notificar(r.user_id,'financeiro','financeiro_pendente',
      'Despesas pendentes', r.qtd || ' lançamento(s) vencendo — total R$ ' || to_char(r.total,'FM999G999G990D00'),
      '/app/financeiro','financeiro',NULL,'normal',24);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.gerar_notificacoes_alertas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerar_notificacoes_alertas() TO authenticated;