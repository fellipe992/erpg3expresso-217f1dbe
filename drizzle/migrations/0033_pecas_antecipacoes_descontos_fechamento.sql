CREATE TABLE public.pecas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  veiculo_id uuid REFERENCES public.veiculos(id),
  motorista_id uuid REFERENCES public.motoristas(id),
  descricao text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  valor_total numeric NOT NULL DEFAULT 0,
  fornecedor text,
  nota_fiscal text,
  observacoes text,
  fechamento_id uuid REFERENCES public.fechamentos(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pecas TO authenticated;
GRANT ALL ON public.pecas TO service_role;
ALTER TABLE public.pecas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pecas read" ON public.pecas FOR SELECT TO authenticated USING (private.is_staff(auth.uid()) OR motorista_id = private.current_motorista_id());
CREATE POLICY "pecas insert" ON public.pecas FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "pecas update" ON public.pecas FOR UPDATE TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "pecas delete" ON public.pecas FOR DELETE TO authenticated USING (private.is_staff(auth.uid()) AND fechamento_id IS NULL);
CREATE TRIGGER trg_pecas_updated BEFORE UPDATE ON public.pecas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.motorista_antecipacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  motorista_id uuid NOT NULL REFERENCES public.motoristas(id),
  veiculo_id uuid REFERENCES public.veiculos(id),
  descricao text NOT NULL,
  valor numeric NOT NULL,
  observacoes text,
  fechamento_id uuid REFERENCES public.fechamentos(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motorista_antecipacoes TO authenticated;
GRANT ALL ON public.motorista_antecipacoes TO service_role;
ALTER TABLE public.motorista_antecipacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "antecip read" ON public.motorista_antecipacoes FOR SELECT TO authenticated USING (private.is_staff(auth.uid()) OR motorista_id = private.current_motorista_id());
CREATE POLICY "antecip insert" ON public.motorista_antecipacoes FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "antecip update" ON public.motorista_antecipacoes FOR UPDATE TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "antecip delete" ON public.motorista_antecipacoes FOR DELETE TO authenticated USING (private.is_staff(auth.uid()) AND fechamento_id IS NULL);
CREATE TRIGGER trg_antecip_updated BEFORE UPDATE ON public.motorista_antecipacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.abastecimentos ADD COLUMN fechamento_id uuid REFERENCES public.fechamentos(id) ON DELETE SET NULL;
ALTER TABLE public.fechamento_descontos ADD COLUMN origem text, ADD COLUMN origem_id uuid, ADD COLUMN data date;

CREATE OR REPLACE FUNCTION public.tg_abastecimento_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _placa TEXT; _os TEXT; _venc DATE; _agregado BOOLEAN;
  _conta_id UUID; _cc TEXT; _cod TEXT;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN RETURN NEW; END IF;
  SELECT placa, COALESCE(agregado,false) INTO _placa, _agregado FROM public.veiculos WHERE id=NEW.veiculo_id;
  -- veículo agregado: a despesa é do motorista e entra como desconto no fechamento
  IF _agregado THEN RETURN NEW; END IF;
  IF NEW.viagem_id IS NOT NULL THEN
    SELECT codigo INTO _os FROM public.viagens WHERE id=NEW.viagem_id;
  END IF;
  _cod := CASE lower(COALESCE(NEW.combustivel,''))
    WHEN 'diesel s10' THEN '2.1.001' WHEN 'diesel s500' THEN '2.1.002'
    WHEN 'arla 32' THEN '2.1.003' WHEN 'gasolina' THEN '2.1.004'
    WHEN 'etanol' THEN '2.1.005' WHEN 'gnv' THEN '2.1.006'
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
     NEW.valor_total, NEW.data, public.quinzena_fim(NEW.data), _venc, 'pendente',
     NEW.viagem_id, NEW.veiculo_id, NEW.motorista_id, 'abastecimento', NEW.id, _os,
     'Forma: '||COALESCE(NEW.forma_pagamento_operacional,'não informada'));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_peca_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _placa TEXT; _agregado BOOLEAN; _conta_id UUID; _cc TEXT;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN RETURN NEW; END IF;
  SELECT placa, COALESCE(agregado,false) INTO _placa, _agregado FROM public.veiculos WHERE id=NEW.veiculo_id;
  IF _agregado THEN RETURN NEW; END IF;
  SELECT id, centro_custo INTO _conta_id, _cc FROM public.plano_contas WHERE codigo='2.2.004' LIMIT 1;
  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia,
     status, veiculo_id, motorista_id, origem, origem_id, numero_documento, fornecedor_nome_tmp)
  SELECT 'pagar', 'Peça '||COALESCE(_placa,'')||' - '||NEW.descricao, 'Peças', COALESCE(_cc,'Manutenção'), _conta_id,
     NEW.valor_total, NEW.data, public.quinzena_fim(NEW.data), 'pendente', NEW.veiculo_id, NEW.motorista_id,
     'peca', NEW.id, NEW.nota_fiscal, NULL
  WHERE false;
  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia,
     status, veiculo_id, motorista_id, origem, origem_id, numero_documento)
  VALUES ('pagar', 'Peça '||COALESCE(_placa,'')||' - '||NEW.descricao, 'Peças', COALESCE(_cc,'Manutenção'), _conta_id,
     NEW.valor_total, NEW.data, public.quinzena_fim(NEW.data), 'pendente', NEW.veiculo_id, NEW.motorista_id,
     'peca', NEW.id, NEW.nota_fiscal);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_peca_financeiro AFTER INSERT ON public.pecas FOR EACH ROW EXECUTE FUNCTION public.tg_peca_financeiro();