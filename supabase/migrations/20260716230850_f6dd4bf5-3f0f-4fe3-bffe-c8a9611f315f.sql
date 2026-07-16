
CREATE TYPE public.viagem_status AS ENUM ('planejada', 'em_andamento', 'concluida', 'cancelada');
CREATE TYPE public.checklist_tipo AS ENUM ('saida', 'chegada');

CREATE TABLE public.viagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  motorista_id UUID REFERENCES public.motoristas(id) ON DELETE SET NULL,
  veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL,
  origem_cidade TEXT,
  origem_uf TEXT,
  destino_cidade TEXT,
  destino_uf TEXT,
  data_prevista_saida TIMESTAMPTZ,
  data_prevista_chegada TIMESTAMPTZ,
  data_saida TIMESTAMPTZ,
  data_chegada TIMESTAMPTZ,
  km_inicial NUMERIC(10,1),
  km_final NUMERIC(10,1),
  valor_frete NUMERIC(12,2),
  status public.viagem_status NOT NULL DEFAULT 'planejada',
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagens TO authenticated;
GRANT ALL ON public.viagens TO service_role;

ALTER TABLE public.viagens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('administrador','gestor','financeiro')
  )
$$;

CREATE OR REPLACE FUNCTION public.current_motorista_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.motoristas WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE POLICY "Staff vê todas as viagens" ON public.viagens
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Motorista vê suas viagens" ON public.viagens
  FOR SELECT TO authenticated USING (motorista_id = public.current_motorista_id());
CREATE POLICY "Staff cria viagens" ON public.viagens
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff edita viagens" ON public.viagens
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Motorista atualiza suas viagens" ON public.viagens
  FOR UPDATE TO authenticated
  USING (motorista_id = public.current_motorista_id())
  WITH CHECK (motorista_id = public.current_motorista_id());
CREATE POLICY "Admin exclui viagens" ON public.viagens
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'));

CREATE TRIGGER update_viagens_updated_at
  BEFORE UPDATE ON public.viagens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_viagens_motorista ON public.viagens(motorista_id);
CREATE INDEX idx_viagens_status ON public.viagens(status);
CREATE INDEX idx_viagens_data_saida ON public.viagens(data_prevista_saida DESC);

CREATE TABLE public.checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  tipo public.checklist_tipo NOT NULL,
  itens JSONB NOT NULL DEFAULT '{}'::jsonb,
  km NUMERIC(10,1),
  combustivel_pct INTEGER,
  foto_url TEXT,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO authenticated;
GRANT ALL ON public.checklists TO service_role;

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê todos os checklists" ON public.checklists
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Motorista vê checklists das suas viagens" ON public.checklists
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.viagens v WHERE v.id = viagem_id AND v.motorista_id = public.current_motorista_id()));
CREATE POLICY "Staff cria checklists" ON public.checklists
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Motorista cria checklists das suas viagens" ON public.checklists
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.viagens v WHERE v.id = viagem_id AND v.motorista_id = public.current_motorista_id()));
CREATE POLICY "Staff edita checklists" ON public.checklists
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Admin exclui checklists" ON public.checklists
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'));

CREATE TRIGGER update_checklists_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_checklists_viagem ON public.checklists(viagem_id);

CREATE POLICY "Autenticados leem fotos de viagem"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'viagem-fotos');
CREATE POLICY "Autenticados enviam fotos de viagem"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'viagem-fotos');
CREATE POLICY "Autenticados atualizam fotos de viagem"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'viagem-fotos');
CREATE POLICY "Admin exclui fotos de viagem"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'viagem-fotos' AND public.has_role(auth.uid(), 'administrador'));
