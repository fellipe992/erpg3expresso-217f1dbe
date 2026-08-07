CREATE OR REPLACE FUNCTION public.tg_viagem_protege_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  NEW.valor_frete := OLD.valor_frete;
  NEW.comissao_percentual := OLD.comissao_percentual;
  NEW.comissao_valor := OLD.comissao_valor;
  NEW.pedagio_estimado := OLD.pedagio_estimado;
  NEW.outros_custos_estimados := OLD.outros_custos_estimados;
  NEW.cliente_id := OLD.cliente_id;
  NEW.motorista_id := OLD.motorista_id;
  NEW.provisao_manutencao_km := OLD.provisao_manutencao_km;
  NEW.provisao_pneus_km := OLD.provisao_pneus_km;
  NEW.distancia_estimada_km := OLD.distancia_estimada_km;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_viagem_protege_financeiro ON public.viagens;
CREATE TRIGGER trg_viagem_protege_financeiro
  BEFORE UPDATE ON public.viagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_protege_financeiro();