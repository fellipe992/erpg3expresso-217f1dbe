CREATE OR REPLACE FUNCTION public.tg_viagem_protege_financeiro()
 RETURNS TRIGGER
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF private.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Não-staff (motorista) só pode registrar a execução operacional da viagem.
  -- Todo o restante é revertido para o valor original.
  NEW.codigo := OLD.codigo;
  NEW.cliente_id := OLD.cliente_id;
  NEW.motorista_id := OLD.motorista_id;
  NEW.veiculo_id := OLD.veiculo_id;
  NEW.origem_cidade := OLD.origem_cidade;
  NEW.origem_uf := OLD.origem_uf;
  NEW.destino_cidade := OLD.destino_cidade;
  NEW.destino_uf := OLD.destino_uf;
  NEW.data_prevista_saida := OLD.data_prevista_saida;
  NEW.data_prevista_chegada := OLD.data_prevista_chegada;
  NEW.valor_frete := OLD.valor_frete;
  NEW.comissao_percentual := OLD.comissao_percentual;
  NEW.comissao_valor := OLD.comissao_valor;
  NEW.pedagio_estimado := OLD.pedagio_estimado;
  NEW.outros_custos_estimados := OLD.outros_custos_estimados;
  NEW.provisao_manutencao_km := OLD.provisao_manutencao_km;
  NEW.provisao_pneus_km := OLD.provisao_pneus_km;
  NEW.distancia_estimada_km := OLD.distancia_estimada_km;
  NEW.observacoes := OLD.observacoes;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.tg_viagem_protege_financeiro() FROM PUBLIC, anon, authenticated;