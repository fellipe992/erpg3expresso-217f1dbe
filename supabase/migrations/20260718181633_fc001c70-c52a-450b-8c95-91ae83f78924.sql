
-- 1) financeiro_lancamentos: rastreabilidade + centro de custo
ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS origem TEXT,
  ADD COLUMN IF NOT EXISTS origem_id UUID,
  ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motorista_id UUID REFERENCES public.motoristas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS centro_custo TEXT;

CREATE INDEX IF NOT EXISTS idx_financeiro_origem ON public.financeiro_lancamentos(origem, origem_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_viagem ON public.financeiro_lancamentos(viagem_id);

-- 2) abastecimentos: forma de pagamento operacional + vínculo viagem
ALTER TABLE public.abastecimentos
  ADD COLUMN IF NOT EXISTS forma_pagamento_operacional TEXT,
  ADD COLUMN IF NOT EXISTS viagem_id UUID REFERENCES public.viagens(id) ON DELETE SET NULL;

-- 3) manutencoes: vínculo viagem
ALTER TABLE public.manutencoes
  ADD COLUMN IF NOT EXISTS viagem_id UUID REFERENCES public.viagens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motorista_id UUID REFERENCES public.motoristas(id) ON DELETE SET NULL;

-- 4) Auto-vincular viagem em andamento em abastecimento/manutenção
CREATE OR REPLACE FUNCTION public.tg_auto_link_viagem_abast()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.viagem_id IS NULL AND NEW.motorista_id IS NOT NULL THEN
    SELECT id INTO NEW.viagem_id
    FROM public.viagens
    WHERE motorista_id = NEW.motorista_id
      AND veiculo_id = NEW.veiculo_id
      AND status = 'em_andamento'
    ORDER BY data_saida DESC NULLS LAST
    LIMIT 1;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_abast_auto_viagem ON public.abastecimentos;
CREATE TRIGGER trg_abast_auto_viagem
  BEFORE INSERT ON public.abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_auto_link_viagem_abast();

CREATE OR REPLACE FUNCTION public.tg_auto_link_viagem_manut()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.viagem_id IS NULL AND NEW.motorista_id IS NOT NULL THEN
    SELECT id INTO NEW.viagem_id
    FROM public.viagens
    WHERE motorista_id = NEW.motorista_id
      AND veiculo_id = NEW.veiculo_id
      AND status = 'em_andamento'
    ORDER BY data_saida DESC NULLS LAST
    LIMIT 1;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_manut_auto_viagem ON public.manutencoes;
CREATE TRIGGER trg_manut_auto_viagem
  BEFORE INSERT ON public.manutencoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_auto_link_viagem_manut();

-- 5) Trigger de viagem -> conta a receber (rastreabilidade)
CREATE OR REPLACE FUNCTION public.tg_viagem_financeiro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing_id UUID;
BEGIN
  IF NEW.status = 'cancelada' THEN
    DELETE FROM public.financeiro_lancamentos
    WHERE viagem_id = NEW.id AND tipo = 'receber' AND status IN ('pendente','atrasado');
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NULL OR NEW.valor_frete IS NULL OR NEW.valor_frete <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _existing_id
  FROM public.financeiro_lancamentos
  WHERE viagem_id = NEW.id AND tipo = 'receber'
  LIMIT 1;

  IF _existing_id IS NULL THEN
    INSERT INTO public.financeiro_lancamentos
      (tipo, descricao, categoria, centro_custo, valor, data_emissao, data_vencimento, status,
       cliente_id, viagem_id, veiculo_id, motorista_id,
       origem, origem_id, numero_documento)
    VALUES
      ('receber',
       'Frete viagem OS ' || COALESCE(NEW.codigo, NEW.id::text),
       'Frete',
       'Receita Operacional',
       NEW.valor_frete,
       COALESCE(NEW.created_at::date, CURRENT_DATE),
       NULL,
       'pendente',
       NEW.cliente_id,
       NEW.id,
       NEW.veiculo_id,
       NEW.motorista_id,
       'viagem',
       NEW.id,
       NEW.codigo);
  ELSE
    UPDATE public.financeiro_lancamentos
    SET valor = NEW.valor_frete,
        cliente_id = NEW.cliente_id,
        veiculo_id = NEW.veiculo_id,
        motorista_id = NEW.motorista_id,
        numero_documento = NEW.codigo,
        origem = 'viagem',
        origem_id = NEW.id,
        centro_custo = COALESCE(centro_custo, 'Receita Operacional')
    WHERE id = _existing_id AND status IN ('pendente','atrasado');
  END IF;
  RETURN NEW;
END; $$;

-- 6) Abastecimento -> conta a pagar (PENDENTE, forma pagto, centro de custo)
CREATE OR REPLACE FUNCTION public.tg_abastecimento_financeiro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _placa TEXT;
  _os TEXT;
  _venc DATE;
BEGIN
  IF NEW.valor_total IS NULL OR NEW.valor_total <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;
  IF NEW.viagem_id IS NOT NULL THEN
    SELECT codigo INTO _os FROM public.viagens WHERE id = NEW.viagem_id;
  END IF;

  _venc := CASE
    WHEN NEW.forma_pagamento_operacional = 'convenio' THEN (NEW.data + INTERVAL '30 days')::date
    ELSE NULL
  END;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, valor, data_emissao, data_vencimento, status,
     viagem_id, veiculo_id, motorista_id,
     origem, origem_id, numero_documento, observacoes)
  VALUES
    ('pagar',
     'Abastecimento ' || COALESCE(_placa, '') || ' - ' || COALESCE(NEW.litros::text, '0') || 'L' ||
       CASE WHEN NEW.posto IS NOT NULL THEN ' (' || NEW.posto || ')' ELSE '' END,
     'Combustível',
     'Combustível',
     NEW.valor_total,
     NEW.data,
     _venc,
     'pendente',
     NEW.viagem_id,
     NEW.veiculo_id,
     NEW.motorista_id,
     'abastecimento',
     NEW.id,
     _os,
     'Forma: ' || COALESCE(NEW.forma_pagamento_operacional, 'não informada'));
  RETURN NEW;
END; $$;

-- 7) Manutenção -> conta a pagar (PENDENTE)
CREATE OR REPLACE FUNCTION public.tg_manutencao_financeiro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _placa TEXT;
  _os TEXT;
BEGIN
  IF NEW.valor IS NULL OR NEW.valor <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;
  IF NEW.viagem_id IS NOT NULL THEN
    SELECT codigo INTO _os FROM public.viagens WHERE id = NEW.viagem_id;
  END IF;

  INSERT INTO public.financeiro_lancamentos
    (tipo, descricao, categoria, centro_custo, valor, data_emissao, data_vencimento, status,
     fornecedor_id, viagem_id, veiculo_id, motorista_id,
     origem, origem_id, numero_documento)
  VALUES
    ('pagar',
     'Manutenção ' || COALESCE(_placa, '') || ' - ' || NEW.tipo ||
       CASE WHEN NEW.oficina IS NOT NULL THEN ' (' || NEW.oficina || ')' ELSE '' END,
     'Manutenção',
     'Manutenção',
     NEW.valor,
     NEW.data,
     NULL,
     'pendente',
     NEW.fornecedor_id,
     NEW.viagem_id,
     NEW.veiculo_id,
     NEW.motorista_id,
     'manutencao',
     NEW.id,
     _os);
  RETURN NEW;
END; $$;

-- 8) OS: numeração automática MAX+1 com lock
CREATE OR REPLACE FUNCTION public.tg_viagem_codigo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _next BIGINT;
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('viagens_codigo_seq'));
    SELECT COALESCE(MAX(NULLIF(regexp_replace(codigo, '\D', '', 'g'), '')::BIGINT), 0) + 1
      INTO _next
      FROM public.viagens
      WHERE codigo ~ '^\d+$';
    NEW.codigo := _next::text;
  END IF;
  RETURN NEW;
END; $$;

-- 9) Backfill leve para lançamentos já existentes
UPDATE public.financeiro_lancamentos l
SET origem = 'viagem',
    origem_id = v.id,
    veiculo_id = COALESCE(l.veiculo_id, v.veiculo_id),
    motorista_id = COALESCE(l.motorista_id, v.motorista_id),
    numero_documento = COALESCE(l.numero_documento, v.codigo),
    centro_custo = COALESCE(l.centro_custo, 'Receita Operacional')
FROM public.viagens v
WHERE l.viagem_id = v.id AND l.origem IS NULL;

UPDATE public.financeiro_lancamentos
SET centro_custo = CASE
  WHEN categoria = 'Combustível' THEN 'Combustível'
  WHEN categoria = 'Manutenção' THEN 'Manutenção'
  WHEN categoria = 'Pedágio' THEN 'Pedágios'
  WHEN categoria = 'Pneus' THEN 'Pneus'
  WHEN categoria = 'Salários' THEN 'Pessoal'
  WHEN categoria = 'Impostos' THEN 'Tributos'
  WHEN categoria = 'Seguro' THEN 'Seguros'
  WHEN categoria = 'Frete' THEN 'Receita Operacional'
  ELSE 'Operacional'
END
WHERE centro_custo IS NULL;
