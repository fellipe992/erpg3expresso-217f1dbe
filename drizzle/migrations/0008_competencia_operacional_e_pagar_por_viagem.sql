-- 1) Total apurado do lado do motorista (espelha viagem_total_cliente)
CREATE OR REPLACE FUNCTION public.viagem_total_motorista(_viagem_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    COALESCE(v.frete_motorista,0)
    + COALESCE(v.pedagio_motorista,0)
    + COALESCE((SELECT SUM(a.valor_motorista) FROM public.viagem_ajustes a
                 WHERE a.viagem_id = v.id AND a.tipo='adicional'),0)
    - COALESCE((SELECT SUM(a.valor_motorista) FROM public.viagem_ajustes a
                 WHERE a.viagem_id = v.id AND a.tipo='desconto'),0)
  , 0)
  FROM public.viagens v WHERE v.id = _viagem_id
$$;

REVOKE EXECUTE ON FUNCTION public.viagem_total_motorista(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viagem_total_motorista(uuid) TO authenticated, service_role;

-- 2) Dia-calendário da operação da viagem, no fuso da operação
CREATE OR REPLACE FUNCTION public.viagem_dia_operacao(_viagem_id uuid)
RETURNS date
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (COALESCE(v.data_saida, v.data_prevista_saida, v.created_at)
          AT TIME ZONE 'America/Sao_Paulo')::date
  FROM public.viagens v WHERE v.id = _viagem_id
$$;

REVOKE EXECUTE ON FUNCTION public.viagem_dia_operacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.viagem_dia_operacao(uuid) TO authenticated, service_role;

-- 3) Trigger da viagem: receita do cliente + custo avulso do motorista, ambos
--    com competência no dia da operação da viagem.
CREATE OR REPLACE FUNCTION public.tg_viagem_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing_id UUID;
  _conta_id UUID;
  _cc TEXT;
  _total NUMERIC;
  _total_mot NUMERIC;
  _dia DATE;
  _fechado_mot BOOLEAN;
BEGIN
  _dia := (COALESCE(NEW.data_saida, NEW.data_prevista_saida, NEW.created_at)
           AT TIME ZONE 'America/Sao_Paulo')::date;

  IF NEW.status = 'cancelada' THEN
    DELETE FROM public.financeiro_lancamentos
      WHERE viagem_id = NEW.id AND status IN ('pendente','atrasado')
        AND (tipo='receber' OR (tipo='pagar' AND origem='viagem'));
    RETURN NEW;
  END IF;

  -- ---- Receita do cliente -------------------------------------------------
  IF NEW.cliente_id IS NOT NULL AND NEW.valor_frete IS NOT NULL AND NEW.valor_frete > 0 THEN
    _total := public.viagem_total_cliente(NEW.id);
    IF _total IS NULL OR _total <= 0 THEN
      _total := NEW.valor_frete;
    END IF;

    SELECT id, centro_custo INTO _conta_id, _cc
      FROM public.plano_contas WHERE codigo='1.1.001' LIMIT 1;

    SELECT id INTO _existing_id FROM public.financeiro_lancamentos
      WHERE viagem_id=NEW.id AND tipo='receber' LIMIT 1;

    IF _existing_id IS NULL THEN
      INSERT INTO public.financeiro_lancamentos
        (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia,
         data_vencimento, status, cliente_id, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento)
      VALUES
        ('receber','Frete viagem OS '||COALESCE(NEW.codigo,NEW.id::text),'Frete',COALESCE(_cc,'Receita Operacional'),_conta_id,
         _total, COALESCE(_dia,CURRENT_DATE), _dia, NULL, 'pendente',
         NEW.cliente_id, NEW.id, NEW.veiculo_id, NEW.motorista_id, 'viagem', NEW.id, NEW.codigo);
    ELSE
      UPDATE public.financeiro_lancamentos
        SET valor=_total, cliente_id=NEW.cliente_id, veiculo_id=NEW.veiculo_id,
            motorista_id=NEW.motorista_id, numero_documento=NEW.codigo,
            origem='viagem', origem_id=NEW.id,
            data_competencia=COALESCE(_dia, data_competencia),
            plano_conta_id=COALESCE(plano_conta_id,_conta_id),
            centro_custo=COALESCE(centro_custo,_cc,'Receita Operacional')
        WHERE id=_existing_id AND status IN ('pendente','atrasado');
    END IF;
  END IF;

  -- ---- Custo avulso do motorista -----------------------------------------
  IF NEW.motorista_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.fechamento_viagens fv
        JOIN public.fechamentos f ON f.id = fv.fechamento_id
       WHERE fv.viagem_id = NEW.id AND fv.tipo='motorista' AND fv.ativo
         AND f.status <> 'cancelado'
    ) INTO _fechado_mot;

    _total_mot := public.viagem_total_motorista(NEW.id);

    IF _fechado_mot THEN
      NULL; -- já consolidado em fechamento: nada de avulso
    ELSIF _total_mot IS NULL OR _total_mot <= 0 THEN
      DELETE FROM public.financeiro_lancamentos
        WHERE viagem_id=NEW.id AND tipo='pagar' AND origem='viagem'
          AND status IN ('pendente','atrasado');
    ELSE
      SELECT id INTO _existing_id FROM public.financeiro_lancamentos
        WHERE viagem_id=NEW.id AND tipo='pagar' AND origem='viagem' LIMIT 1;

      IF _existing_id IS NULL THEN
        INSERT INTO public.financeiro_lancamentos
          (tipo, descricao, categoria, centro_custo, valor, data_emissao, data_competencia,
           data_vencimento, status, cliente_id, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento)
        VALUES
          ('pagar','Frete motorista OS '||COALESCE(NEW.codigo,NEW.id::text),'Frete motorista','Operacional',
           _total_mot, COALESCE(_dia,CURRENT_DATE), _dia, NULL, 'pendente',
           NEW.cliente_id, NEW.id, NEW.veiculo_id, NEW.motorista_id, 'viagem', NEW.id, NEW.codigo);
      ELSE
        UPDATE public.financeiro_lancamentos
          SET valor=_total_mot, motorista_id=NEW.motorista_id, veiculo_id=NEW.veiculo_id,
              cliente_id=NEW.cliente_id, numero_documento=NEW.codigo,
              data_competencia=COALESCE(_dia, data_competencia)
          WHERE id=_existing_id AND status IN ('pendente','atrasado');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_viagem_financeiro ON public.viagens;
CREATE TRIGGER trg_viagem_financeiro
AFTER INSERT OR UPDATE OF status, valor_frete, cliente_id, data_prevista_chegada, data_chegada,
  pedagio_cliente, frete_faixa_id, usar_tabela_cliente, frete_motorista, pedagio_motorista,
  motorista_id, veiculo_id, data_saida, data_prevista_saida
ON public.viagens FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_financeiro();

-- 4) Ajustes recalculam os dois lados
CREATE OR REPLACE FUNCTION public.tg_ajuste_recalc_receber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _vid UUID := COALESCE(NEW.viagem_id, OLD.viagem_id);
  _total NUMERIC;
  _total_mot NUMERIC;
BEGIN
  _total := public.viagem_total_cliente(_vid);
  IF _total > 0 THEN
    UPDATE public.financeiro_lancamentos
      SET valor = _total
      WHERE viagem_id = _vid AND tipo='receber' AND status IN ('pendente','atrasado')
        AND fechamento_id IS NULL;
  END IF;

  _total_mot := public.viagem_total_motorista(_vid);
  IF _total_mot > 0 THEN
    UPDATE public.financeiro_lancamentos
      SET valor = _total_mot
      WHERE viagem_id = _vid AND tipo='pagar' AND origem='viagem'
        AND status IN ('pendente','atrasado') AND fechamento_id IS NULL;
  END IF;
  RETURN NULL;
END $function$;

-- 5) Competência = data do fato nos custos automáticos
CREATE OR REPLACE FUNCTION public.tg_abastecimento_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _placa TEXT; _os TEXT; _venc DATE;
  _conta_id UUID; _cc TEXT; _cod TEXT;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN RETURN NEW; END IF;

  SELECT placa INTO _placa FROM public.veiculos WHERE id=NEW.veiculo_id;
  IF NEW.viagem_id IS NOT NULL THEN
    SELECT codigo INTO _os FROM public.viagens WHERE id=NEW.viagem_id;
  END IF;

  _cod := CASE lower(COALESCE(NEW.combustivel,''))
    WHEN 'diesel s10' THEN '2.1.001'
    WHEN 'diesel s500' THEN '2.1.002'
    WHEN 'arla 32' THEN '2.1.003'
    WHEN 'gasolina' THEN '2.1.004'
    WHEN 'etanol' THEN '2.1.005'
    WHEN 'gnv' THEN '2.1.006'
    ELSE '2.1.001' END;

  SELECT id, centro_custo INTO _conta_id, _cc FROM public.plano_contas WHERE codigo=_cod LIMIT 1;

  _venc := CASE WHEN NEW.forma_pagamento_operacional='convenio' THEN (NEW.data + INTERVAL '30 days')::date ELSE NULL END;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia,
     data_vencimento, status, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento, observacoes)
  VALUES
    ('pagar','Abastecimento '||COALESCE(_placa,'')||' - '||COALESCE(NEW.litros::text,'0')||'L'||
       CASE WHEN NEW.posto IS NOT NULL THEN ' ('||NEW.posto||')' ELSE '' END,
     'Combustível', COALESCE(_cc,'Combustível'), _conta_id,
     NEW.valor_total, NEW.data, COALESCE(public.viagem_dia_operacao(NEW.viagem_id), NEW.data), _venc, 'pendente',
     NEW.viagem_id, NEW.veiculo_id, NEW.motorista_id, 'abastecimento', NEW.id, _os,
     'Forma: '||COALESCE(NEW.forma_pagamento_operacional,'não informada'));
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_manutencao_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _placa TEXT; _os TEXT; _conta_id UUID; _cc TEXT;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor<=0 THEN RETURN NEW; END IF;
  SELECT placa INTO _placa FROM public.veiculos WHERE id=NEW.veiculo_id;
  IF NEW.viagem_id IS NOT NULL THEN
    SELECT codigo INTO _os FROM public.viagens WHERE id=NEW.viagem_id;
  END IF;
  SELECT id, centro_custo INTO _conta_id, _cc FROM public.plano_contas WHERE codigo='2.2.001' LIMIT 1;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia,
     data_vencimento, status, fornecedor_id, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento)
  VALUES
    ('pagar','Manutenção '||COALESCE(_placa,'')||' - '||NEW.tipo||
      CASE WHEN NEW.oficina IS NOT NULL THEN ' ('||NEW.oficina||')' ELSE '' END,
     'Manutenção', COALESCE(_cc,'Manutenção'), _conta_id,
     NEW.valor, NEW.data, COALESCE(public.viagem_dia_operacao(NEW.viagem_id), NEW.data), NULL, 'pendente',
     NEW.fornecedor_id, NEW.viagem_id, NEW.veiculo_id, NEW.motorista_id,
     'manutencao', NEW.id, _os);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_despesa_financeiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _placa TEXT; _os TEXT; _conta_id UUID; _cc TEXT; _cod TEXT;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN RETURN NEW; END IF;
  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;
  IF NEW.viagem_id IS NOT NULL THEN
    SELECT codigo INTO _os FROM public.viagens WHERE id = NEW.viagem_id;
  END IF;

  _cod := CASE lower(COALESCE(NEW.categoria,''))
    WHEN 'alimentação' THEN '2.5.001'
    WHEN 'hospedagem' THEN '2.6.001'
    WHEN 'pedágio' THEN '2.3.001'
    ELSE '8.1.001' END;
  SELECT id, centro_custo INTO _conta_id, _cc FROM public.plano_contas WHERE codigo = _cod LIMIT 1;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia, status,
     viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento, observacoes)
  VALUES
    ('pagar', NEW.categoria || CASE WHEN NEW.descricao IS NOT NULL THEN ' - '||NEW.descricao ELSE '' END ||
       CASE WHEN _placa IS NOT NULL THEN ' ('||_placa||')' ELSE '' END,
     NEW.categoria, COALESCE(_cc,'Operacional'), _conta_id,
     NEW.valor, NEW.data, COALESCE(public.viagem_dia_operacao(NEW.viagem_id), NEW.data), 'pendente',
     NEW.viagem_id, NEW.veiculo_id, NEW.motorista_id, 'despesa_operacional', NEW.id, _os,
     'Forma: '||COALESCE(NEW.forma_pagamento_operacional,'não informada'));
  RETURN NEW;
END; $function$;

-- 6) Histórico: competência dos lançamentos ligados a viagem = dia da operação
UPDATE public.financeiro_lancamentos l
   SET data_competencia = public.viagem_dia_operacao(l.viagem_id)
 WHERE l.viagem_id IS NOT NULL
   AND l.fechamento_id IS NULL
   AND public.viagem_dia_operacao(l.viagem_id) IS NOT NULL
   AND l.data_competencia IS DISTINCT FROM public.viagem_dia_operacao(l.viagem_id);

-- Competência dos consolidados = fim do período apurado
UPDATE public.financeiro_lancamentos l
   SET data_competencia = f.periodo_fim
  FROM public.fechamentos f
 WHERE l.fechamento_id = f.id
   AND l.data_competencia IS DISTINCT FROM f.periodo_fim;

-- 7) Histórico: gerar o "a pagar" avulso das viagens ainda não fechadas
INSERT INTO public.financeiro_lancamentos
  (tipo, descricao, categoria, centro_custo, valor, data_emissao, data_competencia, status,
   cliente_id, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento)
SELECT 'pagar',
       'Frete motorista OS '||COALESCE(v.codigo, v.id::text),
       'Frete motorista','Operacional',
       public.viagem_total_motorista(v.id),
       COALESCE(public.viagem_dia_operacao(v.id), CURRENT_DATE),
       public.viagem_dia_operacao(v.id),
       'pendente',
       v.cliente_id, v.id, v.veiculo_id, v.motorista_id, 'viagem', v.id, v.codigo
  FROM public.viagens v
 WHERE v.status <> 'cancelada'
   AND v.motorista_id IS NOT NULL
   AND public.viagem_total_motorista(v.id) > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.financeiro_lancamentos l
      WHERE l.viagem_id = v.id AND l.tipo='pagar' AND l.origem='viagem')
   AND NOT EXISTS (
     SELECT 1 FROM public.fechamento_viagens fv
       JOIN public.fechamentos f ON f.id = fv.fechamento_id
      WHERE fv.viagem_id = v.id AND fv.tipo='motorista' AND fv.ativo AND f.status <> 'cancelado');

CREATE INDEX IF NOT EXISTS idx_fin_lanc_competencia ON public.financeiro_lancamentos (data_competencia);
