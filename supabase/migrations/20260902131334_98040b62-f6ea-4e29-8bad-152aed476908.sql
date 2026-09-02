-- 1. Tipologias dinâmicas de veículo
CREATE TABLE public.tipologias_veiculo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tipologias_veiculo TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tipologias_veiculo TO authenticated;
GRANT ALL ON public.tipologias_veiculo TO service_role;
ALTER TABLE public.tipologias_veiculo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipologias_select_auth" ON public.tipologias_veiculo FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipologias_write_staff" ON public.tipologias_veiculo FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER trg_tipologias_updated BEFORE UPDATE ON public.tipologias_veiculo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.tipologias_veiculo (codigo, nome, ordem) VALUES
  ('fiorino','Fiorino',10),
  ('van','Van',20),
  ('vuc','VUC',30),
  ('tres_quartos','3/4',40),
  ('toco','Toco',50),
  ('truck','Truck',60),
  ('bitruck','Bitruck',70),
  ('cavalo','Cavalo',80),
  ('carreta','Carreta',90),
  ('utilitario','Utilitário',100),
  ('outro','Outro',110);

ALTER TABLE public.veiculos ADD COLUMN tipologia_id uuid REFERENCES public.tipologias_veiculo(id);
UPDATE public.veiculos v SET tipologia_id = t.id
  FROM public.tipologias_veiculo t WHERE t.codigo = v.tipo::text AND v.tipologia_id IS NULL;

-- 2. Tabelas de frete por cliente
CREATE TABLE public.frete_tabelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  destino text NOT NULL CHECK (destino IN ('cliente','motorista')),
  nome text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, destino)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frete_tabelas TO authenticated;
GRANT ALL ON public.frete_tabelas TO service_role;
ALTER TABLE public.frete_tabelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frete_tabelas_staff" ON public.frete_tabelas FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER trg_frete_tabelas_updated BEFORE UPDATE ON public.frete_tabelas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.frete_faixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid NOT NULL REFERENCES public.frete_tabelas(id) ON DELETE CASCADE,
  km_min numeric NOT NULL DEFAULT 0,
  km_max numeric NOT NULL,
  descricao text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_frete_faixas_tabela ON public.frete_faixas(tabela_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frete_faixas TO authenticated;
GRANT ALL ON public.frete_faixas TO service_role;
ALTER TABLE public.frete_faixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frete_faixas_staff" ON public.frete_faixas FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER trg_frete_faixas_updated BEFORE UPDATE ON public.frete_faixas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_frete_faixa_valida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.km_max <= NEW.km_min THEN
    RAISE EXCEPTION 'KM final deve ser maior que o KM inicial';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.frete_faixas f
     WHERE f.tabela_id = NEW.tabela_id
       AND f.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
       AND NEW.km_min < f.km_max AND NEW.km_max > f.km_min
  ) THEN
    RAISE EXCEPTION 'Faixa de raio sobreposta a outra faixa desta tabela';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_frete_faixa_valida BEFORE INSERT OR UPDATE ON public.frete_faixas
  FOR EACH ROW EXECUTE FUNCTION public.tg_frete_faixa_valida();

CREATE TABLE public.frete_precos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faixa_id uuid NOT NULL REFERENCES public.frete_faixas(id) ON DELETE CASCADE,
  tipologia_id uuid NOT NULL REFERENCES public.tipologias_veiculo(id) ON DELETE CASCADE,
  valor numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (faixa_id, tipologia_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frete_precos TO authenticated;
GRANT ALL ON public.frete_precos TO service_role;
ALTER TABLE public.frete_precos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "frete_precos_staff" ON public.frete_precos FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER trg_frete_precos_updated BEFORE UPDATE ON public.frete_precos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Campos novos na viagem (valor_frete continua sendo o frete do cliente)
ALTER TABLE public.viagens
  ADD COLUMN usar_tabela_cliente boolean NOT NULL DEFAULT false,
  ADD COLUMN frete_faixa_id uuid REFERENCES public.frete_faixas(id),
  ADD COLUMN frete_motorista numeric,
  ADD COLUMN pedagio_cliente numeric,
  ADD COLUMN pedagio_motorista numeric;

-- 4. Descontos / adicionais / pedágios da viagem
CREATE TABLE public.viagem_ajustes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('desconto','adicional')),
  descricao text NOT NULL,
  valor_cliente numeric NOT NULL DEFAULT 0,
  valor_motorista numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_viagem_ajustes_viagem ON public.viagem_ajustes(viagem_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagem_ajustes TO authenticated;
GRANT ALL ON public.viagem_ajustes TO service_role;
ALTER TABLE public.viagem_ajustes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "viagem_ajustes_staff" ON public.viagem_ajustes FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER trg_viagem_ajustes_updated BEFORE UPDATE ON public.viagem_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Fechamentos
CREATE SEQUENCE public.fechamentos_numero_seq;
CREATE TABLE public.fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigint NOT NULL DEFAULT nextval('public.fechamentos_numero_seq') UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('cliente','motorista')),
  cliente_id uuid REFERENCES public.clientes(id),
  motorista_id uuid REFERENCES public.motoristas(id),
  veiculo_id uuid REFERENCES public.veiculos(id),
  periodo_inicio date NOT NULL,
  periodo_fim date NOT NULL,
  descricao text NOT NULL,
  vencimento date,
  valor numeric NOT NULL DEFAULT 0,
  valor_viagens numeric NOT NULL DEFAULT 0,
  valor_descontos_extras numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'confirmado' CHECK (status IN ('confirmado','cancelado')),
  lancamento_id uuid REFERENCES public.financeiro_lancamentos(id),
  observacoes text,
  created_by uuid,
  cancelado_por uuid,
  cancelado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamentos TO authenticated;
GRANT ALL ON public.fechamentos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fechamentos_numero_seq TO authenticated;
GRANT ALL ON SEQUENCE public.fechamentos_numero_seq TO service_role;
ALTER TABLE public.fechamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamentos_staff" ON public.fechamentos FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE TRIGGER trg_fechamentos_updated BEFORE UPDATE ON public.fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fechamento_viagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.fechamentos(id) ON DELETE CASCADE,
  viagem_id uuid NOT NULL REFERENCES public.viagens(id),
  tipo text NOT NULL CHECK (tipo IN ('cliente','motorista')),
  ativo boolean NOT NULL DEFAULT true,
  frete numeric NOT NULL DEFAULT 0,
  pedagio numeric NOT NULL DEFAULT 0,
  adicionais numeric NOT NULL DEFAULT 0,
  descontos numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fechamento_id, viagem_id)
);
CREATE UNIQUE INDEX idx_fechamento_viagem_unica ON public.fechamento_viagens(viagem_id, tipo) WHERE ativo;
CREATE INDEX idx_fechamento_viagens_fech ON public.fechamento_viagens(fechamento_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamento_viagens TO authenticated;
GRANT ALL ON public.fechamento_viagens TO service_role;
ALTER TABLE public.fechamento_viagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamento_viagens_staff" ON public.fechamento_viagens FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

CREATE TABLE public.fechamento_descontos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.fechamentos(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fechamento_descontos_fech ON public.fechamento_descontos(fechamento_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamento_descontos TO authenticated;
GRANT ALL ON public.fechamento_descontos TO service_role;
ALTER TABLE public.fechamento_descontos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamento_descontos_staff" ON public.fechamento_descontos FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

-- 6. Vínculo do financeiro com o fechamento
ALTER TABLE public.financeiro_lancamentos ADD COLUMN fechamento_id uuid REFERENCES public.fechamentos(id);
CREATE INDEX idx_financeiro_fechamento ON public.financeiro_lancamentos(fechamento_id);