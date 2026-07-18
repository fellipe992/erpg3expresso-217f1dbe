
-- =========================================================
-- PLANO DE CONTAS FINANCEIRO
-- =========================================================

-- Tipos
DO $$ BEGIN
  CREATE TYPE public.plano_tipo AS ENUM ('receita','despesa','outros');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- centros_custo ----------
CREATE TABLE IF NOT EXISTS public.centros_custo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.centros_custo TO authenticated;
GRANT ALL ON public.centros_custo TO service_role;
ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read centros_custo" ON public.centros_custo FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin manage centros_custo" ON public.centros_custo FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));

CREATE TRIGGER trg_centros_custo_updated BEFORE UPDATE ON public.centros_custo
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- plano_grupos ----------
CREATE TABLE IF NOT EXISTS public.plano_grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo public.plano_tipo NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_grupos TO authenticated;
GRANT ALL ON public.plano_grupos TO service_role;
ALTER TABLE public.plano_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read plano_grupos" ON public.plano_grupos FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin manage plano_grupos" ON public.plano_grupos FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_plano_grupos_updated BEFORE UPDATE ON public.plano_grupos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- plano_subgrupos ----------
CREATE TABLE IF NOT EXISTS public.plano_subgrupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID NOT NULL REFERENCES public.plano_grupos(id) ON DELETE RESTRICT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ordem INT NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_subgrupos TO authenticated;
GRANT ALL ON public.plano_subgrupos TO service_role;
ALTER TABLE public.plano_subgrupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read plano_subgrupos" ON public.plano_subgrupos FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin manage plano_subgrupos" ON public.plano_subgrupos FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_plano_subgrupos_updated BEFORE UPDATE ON public.plano_subgrupos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- plano_contas ----------
CREATE TABLE IF NOT EXISTS public.plano_contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subgrupo_id UUID NOT NULL REFERENCES public.plano_subgrupos(id) ON DELETE RESTRICT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo public.plano_tipo NOT NULL,
  centro_custo TEXT,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subgrupo_id, nome)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_contas TO authenticated;
GRANT ALL ON public.plano_contas TO service_role;
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read plano_contas" ON public.plano_contas FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admin manage plano_contas" ON public.plano_contas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_plano_contas_updated BEFORE UPDATE ON public.plano_contas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_plano_subgrupos_grupo ON public.plano_subgrupos(grupo_id);
CREATE INDEX IF NOT EXISTS idx_plano_contas_subgrupo ON public.plano_contas(subgrupo_id);

-- ---------- plano_auditoria ----------
CREATE TABLE IF NOT EXISTS public.plano_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade TEXT NOT NULL,       -- 'grupo' | 'subgrupo' | 'conta' | 'centro_custo'
  entidade_id UUID NOT NULL,
  acao TEXT NOT NULL,           -- 'criar' | 'atualizar' | 'inativar' | 'reativar'
  descricao TEXT,
  dados_antes JSONB,
  dados_depois JSONB,
  usuario_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.plano_auditoria TO authenticated;
GRANT ALL ON public.plano_auditoria TO service_role;
ALTER TABLE public.plano_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read plano_auditoria" ON public.plano_auditoria FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "system insert plano_auditoria" ON public.plano_auditoria FOR INSERT TO authenticated WITH CHECK (true);

-- ---------- Trigger de auditoria ----------
CREATE OR REPLACE FUNCTION public.tg_plano_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _ent TEXT := TG_ARGV[0];
  _acao TEXT;
  _desc TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _acao := 'criar';
    _desc := 'Criação de ' || _ent || ' "' || COALESCE(NEW.nome, NEW.id::text) || '"';
    INSERT INTO public.plano_auditoria(entidade, entidade_id, acao, descricao, dados_depois, usuario_id)
    VALUES (_ent, NEW.id, _acao, _desc, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.ativo AND NOT NEW.ativo THEN
      _acao := 'inativar'; _desc := 'Inativação de ' || _ent || ' "' || NEW.nome || '"';
    ELSIF NOT OLD.ativo AND NEW.ativo THEN
      _acao := 'reativar'; _desc := 'Reativação de ' || _ent || ' "' || NEW.nome || '"';
    ELSE
      _acao := 'atualizar'; _desc := 'Alteração de ' || _ent || ' "' || NEW.nome || '"';
    END IF;
    INSERT INTO public.plano_auditoria(entidade, entidade_id, acao, descricao, dados_antes, dados_depois, usuario_id)
    VALUES (_ent, NEW.id, _acao, _desc, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_aud_grupos AFTER INSERT OR UPDATE ON public.plano_grupos FOR EACH ROW EXECUTE FUNCTION public.tg_plano_auditoria('grupo');
CREATE TRIGGER trg_aud_subgrupos AFTER INSERT OR UPDATE ON public.plano_subgrupos FOR EACH ROW EXECUTE FUNCTION public.tg_plano_auditoria('subgrupo');
CREATE TRIGGER trg_aud_contas AFTER INSERT OR UPDATE ON public.plano_contas FOR EACH ROW EXECUTE FUNCTION public.tg_plano_auditoria('conta');
CREATE TRIGGER trg_aud_cc AFTER INSERT OR UPDATE ON public.centros_custo FOR EACH ROW EXECUTE FUNCTION public.tg_plano_auditoria('centro_custo');

-- ---------- Vínculo em financeiro_lancamentos ----------
ALTER TABLE public.financeiro_lancamentos
  ADD COLUMN IF NOT EXISTS plano_conta_id UUID REFERENCES public.plano_contas(id);
CREATE INDEX IF NOT EXISTS idx_fin_plano_conta ON public.financeiro_lancamentos(plano_conta_id);

-- =========================================================
-- SEED
-- =========================================================

-- Centros de custo
INSERT INTO public.centros_custo (nome) VALUES
 ('Receita Operacional'),('Combustível'),('Manutenção'),('Pedágios'),('Pneus'),
 ('Pessoal'),('Administrativo'),('Tributos'),('Seguros'),('Financeiro'),
 ('Operacional'),('Outros')
ON CONFLICT (nome) DO NOTHING;

-- Grupos
INSERT INTO public.plano_grupos (codigo, nome, tipo, ordem) VALUES
 ('1','Receitas','receita',1),
 ('2','Despesas Operacionais','despesa',2),
 ('3','Despesas Administrativas','despesa',3),
 ('4','Despesas Financeiras','despesa',4),
 ('5','Tributos','despesa',5),
 ('6','Investimentos','outros',6),
 ('7','Patrimônio','outros',7),
 ('8','Outros','outros',8)
ON CONFLICT (codigo) DO NOTHING;

-- Subgrupos
DO $seed$
DECLARE
  g_rec UUID; g_op UUID; g_adm UUID; g_trib UUID; g_fin UUID;
  s_fretes UUID; s_serv UUID; s_bonif UUID; s_outras_rec UUID;
  s_comb UUID; s_manut UUID; s_ped UUID; s_pneus UUID; s_alim UUID; s_hosp UUID;
  s_sal UUID; s_pro UUID; s_ener UUID; s_int UUID; s_cont UUID; s_esc UUID;
  s_icms UUID; s_iss UUID; s_simples UUID; s_inss UUID; s_fgts UUID;
BEGIN
  SELECT id INTO g_rec FROM public.plano_grupos WHERE codigo='1';
  SELECT id INTO g_op FROM public.plano_grupos WHERE codigo='2';
  SELECT id INTO g_adm FROM public.plano_grupos WHERE codigo='3';
  SELECT id INTO g_fin FROM public.plano_grupos WHERE codigo='4';
  SELECT id INTO g_trib FROM public.plano_grupos WHERE codigo='5';

  -- Receitas
  INSERT INTO public.plano_subgrupos (grupo_id, codigo, nome, ordem) VALUES
   (g_rec,'1.1','Fretes',1),(g_rec,'1.2','Serviços',2),(g_rec,'1.3','Bonificações',3),(g_rec,'1.4','Outras Receitas',4)
  ON CONFLICT (codigo) DO NOTHING;

  -- Despesas Operacionais
  INSERT INTO public.plano_subgrupos (grupo_id, codigo, nome, ordem) VALUES
   (g_op,'2.1','Combustível',1),(g_op,'2.2','Manutenção',2),(g_op,'2.3','Pedágios',3),
   (g_op,'2.4','Pneus',4),(g_op,'2.5','Alimentação',5),(g_op,'2.6','Hospedagem',6)
  ON CONFLICT (codigo) DO NOTHING;

  -- Administrativas
  INSERT INTO public.plano_subgrupos (grupo_id, codigo, nome, ordem) VALUES
   (g_adm,'3.1','Salários',1),(g_adm,'3.2','Pró-labore',2),(g_adm,'3.3','Energia',3),
   (g_adm,'3.4','Internet',4),(g_adm,'3.5','Contabilidade',5),(g_adm,'3.6','Escritório',6)
  ON CONFLICT (codigo) DO NOTHING;

  -- Tributos
  INSERT INTO public.plano_subgrupos (grupo_id, codigo, nome, ordem) VALUES
   (g_trib,'5.1','ICMS',1),(g_trib,'5.2','ISS',2),(g_trib,'5.3','Simples Nacional',3),
   (g_trib,'5.4','INSS',4),(g_trib,'5.5','FGTS',5)
  ON CONFLICT (codigo) DO NOTHING;

  -- Contas: Receitas/Fretes
  SELECT id INTO s_fretes FROM public.plano_subgrupos WHERE codigo='1.1';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_fretes,'1.1.001','Frete CIF','receita','Receita Operacional'),
   (s_fretes,'1.1.002','Frete FOB','receita','Receita Operacional')
  ON CONFLICT (codigo) DO NOTHING;

  SELECT id INTO s_serv FROM public.plano_subgrupos WHERE codigo='1.2';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_serv,'1.2.001','Serviços Prestados','receita','Receita Operacional')
  ON CONFLICT (codigo) DO NOTHING;

  SELECT id INTO s_outras_rec FROM public.plano_subgrupos WHERE codigo='1.4';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_outras_rec,'1.4.001','Outras Receitas','receita','Receita Operacional')
  ON CONFLICT (codigo) DO NOTHING;

  -- Combustível
  SELECT id INTO s_comb FROM public.plano_subgrupos WHERE codigo='2.1';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_comb,'2.1.001','Diesel S10','despesa','Combustível'),
   (s_comb,'2.1.002','Diesel S500','despesa','Combustível'),
   (s_comb,'2.1.003','ARLA 32','despesa','Combustível'),
   (s_comb,'2.1.004','Gasolina','despesa','Combustível'),
   (s_comb,'2.1.005','Etanol','despesa','Combustível'),
   (s_comb,'2.1.006','GNV','despesa','Combustível')
  ON CONFLICT (codigo) DO NOTHING;

  -- Manutenção
  SELECT id INTO s_manut FROM public.plano_subgrupos WHERE codigo='2.2';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_manut,'2.2.001','Manutenção Geral','despesa','Manutenção'),
   (s_manut,'2.2.002','Troca de Óleo','despesa','Manutenção'),
   (s_manut,'2.2.003','Troca de Filtros','despesa','Manutenção'),
   (s_manut,'2.2.004','Peças e Reparos','despesa','Manutenção')
  ON CONFLICT (codigo) DO NOTHING;

  -- Pedágios
  SELECT id INTO s_ped FROM public.plano_subgrupos WHERE codigo='2.3';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_ped,'2.3.001','Pedágio','despesa','Pedágios')
  ON CONFLICT (codigo) DO NOTHING;

  -- Pneus
  SELECT id INTO s_pneus FROM public.plano_subgrupos WHERE codigo='2.4';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_pneus,'2.4.001','Compra de Pneus','despesa','Pneus'),
   (s_pneus,'2.4.002','Recapagem','despesa','Pneus')
  ON CONFLICT (codigo) DO NOTHING;

  -- Alimentação / Hospedagem
  SELECT id INTO s_alim FROM public.plano_subgrupos WHERE codigo='2.5';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_alim,'2.5.001','Alimentação Motorista','despesa','Operacional')
  ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_hosp FROM public.plano_subgrupos WHERE codigo='2.6';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_hosp,'2.6.001','Hospedagem','despesa','Operacional')
  ON CONFLICT (codigo) DO NOTHING;

  -- Administrativas
  SELECT id INTO s_sal FROM public.plano_subgrupos WHERE codigo='3.1';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_sal,'3.1.001','Salários','despesa','Pessoal') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_pro FROM public.plano_subgrupos WHERE codigo='3.2';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_pro,'3.2.001','Pró-labore','despesa','Pessoal') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_ener FROM public.plano_subgrupos WHERE codigo='3.3';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_ener,'3.3.001','Energia Elétrica','despesa','Administrativo') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_int FROM public.plano_subgrupos WHERE codigo='3.4';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_int,'3.4.001','Internet','despesa','Administrativo') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_cont FROM public.plano_subgrupos WHERE codigo='3.5';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_cont,'3.5.001','Contabilidade','despesa','Administrativo') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_esc FROM public.plano_subgrupos WHERE codigo='3.6';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES
   (s_esc,'3.6.001','Material de Escritório','despesa','Administrativo') ON CONFLICT (codigo) DO NOTHING;

  -- Tributos
  SELECT id INTO s_icms FROM public.plano_subgrupos WHERE codigo='5.1';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES (s_icms,'5.1.001','ICMS','despesa','Tributos') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_iss FROM public.plano_subgrupos WHERE codigo='5.2';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES (s_iss,'5.2.001','ISS','despesa','Tributos') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_simples FROM public.plano_subgrupos WHERE codigo='5.3';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES (s_simples,'5.3.001','Simples Nacional','despesa','Tributos') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_inss FROM public.plano_subgrupos WHERE codigo='5.4';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES (s_inss,'5.4.001','INSS','despesa','Tributos') ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO s_fgts FROM public.plano_subgrupos WHERE codigo='5.5';
  INSERT INTO public.plano_contas (subgrupo_id, codigo, nome, tipo, centro_custo) VALUES (s_fgts,'5.5.001','FGTS','despesa','Tributos') ON CONFLICT (codigo) DO NOTHING;
END $seed$;

-- =========================================================
-- Atualiza triggers para preencher plano_conta_id
-- =========================================================

CREATE OR REPLACE FUNCTION public.tg_viagem_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _existing_id UUID;
  _conta_id UUID;
  _cc TEXT;
BEGIN
  IF NEW.status = 'cancelada' THEN
    DELETE FROM public.financeiro_lancamentos
      WHERE viagem_id = NEW.id AND tipo='receber' AND status IN ('pendente','atrasado');
    RETURN NEW;
  END IF;
  IF NEW.cliente_id IS NULL OR NEW.valor_frete IS NULL OR NEW.valor_frete <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id, centro_custo INTO _conta_id, _cc
    FROM public.plano_contas WHERE codigo='1.1.001' LIMIT 1;

  SELECT id INTO _existing_id FROM public.financeiro_lancamentos
    WHERE viagem_id=NEW.id AND tipo='receber' LIMIT 1;

  IF _existing_id IS NULL THEN
    INSERT INTO public.financeiro_lancamentos
      (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_vencimento, status,
       cliente_id, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento)
    VALUES
      ('receber','Frete viagem OS '||COALESCE(NEW.codigo,NEW.id::text),'Frete',COALESCE(_cc,'Receita Operacional'),_conta_id,
       NEW.valor_frete, COALESCE(NEW.created_at::date,CURRENT_DATE), NULL, 'pendente',
       NEW.cliente_id, NEW.id, NEW.veiculo_id, NEW.motorista_id, 'viagem', NEW.id, NEW.codigo);
  ELSE
    UPDATE public.financeiro_lancamentos
      SET valor=NEW.valor_frete, cliente_id=NEW.cliente_id, veiculo_id=NEW.veiculo_id,
          motorista_id=NEW.motorista_id, numero_documento=NEW.codigo,
          origem='viagem', origem_id=NEW.id,
          plano_conta_id=COALESCE(plano_conta_id,_conta_id),
          centro_custo=COALESCE(centro_custo,_cc,'Receita Operacional')
      WHERE id=_existing_id AND status IN ('pendente','atrasado');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_abastecimento_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_vencimento, status,
     viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento, observacoes)
  VALUES
    ('pagar','Abastecimento '||COALESCE(_placa,'')||' - '||COALESCE(NEW.litros::text,'0')||'L'||
       CASE WHEN NEW.posto IS NOT NULL THEN ' ('||NEW.posto||')' ELSE '' END,
     'Combustível', COALESCE(_cc,'Combustível'), _conta_id,
     NEW.valor_total, NEW.data, _venc, 'pendente',
     NEW.viagem_id, NEW.veiculo_id, NEW.motorista_id, 'abastecimento', NEW.id, _os,
     'Forma: '||COALESCE(NEW.forma_pagamento_operacional,'não informada'));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_manutencao_financeiro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
    (tipo, descricao, categoria, centro_custo, plano_conta_id, valor, data_emissao, data_vencimento, status,
     fornecedor_id, viagem_id, veiculo_id, motorista_id, origem, origem_id, numero_documento)
  VALUES
    ('pagar','Manutenção '||COALESCE(_placa,'')||' - '||NEW.tipo||
      CASE WHEN NEW.oficina IS NOT NULL THEN ' ('||NEW.oficina||')' ELSE '' END,
     'Manutenção', COALESCE(_cc,'Manutenção'), _conta_id,
     NEW.valor, NEW.data, NULL, 'pendente',
     NEW.fornecedor_id, NEW.viagem_id, NEW.veiculo_id, NEW.motorista_id,
     'manutencao', NEW.id, _os);
  RETURN NEW;
END $$;

-- =========================================================
-- BACKFILL
-- =========================================================
UPDATE public.financeiro_lancamentos SET plano_conta_id = pc.id
  FROM public.plano_contas pc
  WHERE pc.codigo='1.1.001' AND financeiro_lancamentos.plano_conta_id IS NULL
    AND (financeiro_lancamentos.origem='viagem' OR financeiro_lancamentos.categoria='Frete');

UPDATE public.financeiro_lancamentos SET plano_conta_id = pc.id
  FROM public.plano_contas pc
  WHERE pc.codigo='2.1.001' AND financeiro_lancamentos.plano_conta_id IS NULL
    AND (financeiro_lancamentos.origem='abastecimento' OR financeiro_lancamentos.categoria='Combustível');

UPDATE public.financeiro_lancamentos SET plano_conta_id = pc.id
  FROM public.plano_contas pc
  WHERE pc.codigo='2.2.001' AND financeiro_lancamentos.plano_conta_id IS NULL
    AND (financeiro_lancamentos.origem='manutencao' OR financeiro_lancamentos.categoria='Manutenção');
