CREATE TABLE public.faturas_fornecedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero serial,
  tipo text NOT NULL CHECK (tipo IN ('abastecimento','peca')),
  fornecedor text,
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  vencimento date,
  descricao text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  quantidade_itens integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','cancelada')),
  lancamento_id uuid REFERENCES public.financeiro_lancamentos(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelado_em timestamptz,
  cancelado_por uuid
);
GRANT SELECT, INSERT, UPDATE ON public.faturas_fornecedor TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.faturas_fornecedor_numero_seq TO authenticated;
GRANT ALL ON public.faturas_fornecedor TO service_role;
ALTER TABLE public.faturas_fornecedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "faturas forn read" ON public.faturas_fornecedor FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "faturas forn insert" ON public.faturas_fornecedor FOR INSERT TO authenticated WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "faturas forn update" ON public.faturas_fornecedor FOR UPDATE TO authenticated USING (private.is_staff(auth.uid()));

ALTER TABLE public.abastecimentos ADD COLUMN fatura_id uuid REFERENCES public.faturas_fornecedor(id) ON DELETE SET NULL;
ALTER TABLE public.pecas ADD COLUMN fatura_id uuid REFERENCES public.faturas_fornecedor(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tg_abastecimento_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
DECLARE _placa TEXT; _conta_id UUID; _cc TEXT;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN RETURN NEW; END IF;
  SELECT placa INTO _placa FROM public.veiculos WHERE id=NEW.veiculo_id;
  SELECT id, centro_custo INTO _conta_id, _cc FROM public.plano_contas WHERE codigo='2.2.004' LIMIT 1;
  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_competencia,
     status, veiculo_id, motorista_id, origem, origem_id, numero_documento, observacoes)
  VALUES ('pagar', 'Peça '||COALESCE(_placa,'')||' - '||NEW.descricao, 'Peças', COALESCE(_cc,'Manutenção'), _conta_id,
     NEW.valor_total, NEW.data, public.quinzena_fim(NEW.data), 'pendente', NEW.veiculo_id, NEW.motorista_id,
     'peca', NEW.id, NEW.nota_fiscal, CASE WHEN NEW.fornecedor IS NOT NULL THEN 'Fornecedor: '||NEW.fornecedor END);
  RETURN NEW;
END $$;