
-- Atualizar logo e email admin
UPDATE public.company_settings SET logo_url = 'logos/logo-g3.png', updated_at = now();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
  _has_admin BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1))
  );
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE role = 'administrador') INTO _has_admin;
  IF lower(NEW.email) IN ('fellipe@g3expresso.com.br', 'admin@g3expresso.com') OR NOT _has_admin THEN
    _role := 'administrador';
  ELSE
    _role := 'motorista';
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$function$;

-- ==================== FASE 2: Cadastros base ====================

CREATE TYPE public.pessoa_tipo AS ENUM ('pf', 'pj');
CREATE TYPE public.veiculo_tipo AS ENUM ('cavalo', 'carreta', 'truck', 'toco', 'van', 'utilitario', 'outro');
CREATE TYPE public.fornecedor_categoria AS ENUM ('combustivel', 'manutencao', 'pneu', 'seguro', 'peca', 'servico', 'outros');

-- ============ VEÍCULOS ============
CREATE TABLE public.veiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa TEXT NOT NULL UNIQUE,
  modelo TEXT NOT NULL,
  marca TEXT,
  ano INTEGER,
  tipo public.veiculo_tipo NOT NULL DEFAULT 'outro',
  renavam TEXT,
  chassi TEXT,
  capacidade_kg NUMERIC(10,2),
  cor TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.veiculos TO authenticated;
GRANT ALL ON public.veiculos TO service_role;
ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read veiculos" ON public.veiculos FOR SELECT TO authenticated USING (true);
CREATE POLICY "write veiculos" ON public.veiculos FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "update veiculos" ON public.veiculos FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "delete veiculos" ON public.veiculos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_veiculos_updated BEFORE UPDATE ON public.veiculos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MOTORISTAS ============
CREATE TABLE public.motoristas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  cnh TEXT,
  cnh_categoria TEXT,
  cnh_validade DATE,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motoristas TO authenticated;
GRANT ALL ON public.motoristas TO service_role;
ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read motoristas" ON public.motoristas FOR SELECT TO authenticated USING (true);
CREATE POLICY "write motoristas" ON public.motoristas FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "update motoristas" ON public.motoristas FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "delete motoristas" ON public.motoristas FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_motoristas_updated BEFORE UPDATE ON public.motoristas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CLIENTES ============
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.pessoa_tipo NOT NULL DEFAULT 'pj',
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj_cpf TEXT,
  inscricao_estadual TEXT,
  contato_nome TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read clientes" ON public.clientes FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "write clientes" ON public.clientes FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "update clientes" ON public.clientes FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "delete clientes" ON public.clientes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ FORNECEDORES ============
CREATE TABLE public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.pessoa_tipo NOT NULL DEFAULT 'pj',
  categoria public.fornecedor_categoria NOT NULL DEFAULT 'outros',
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj_cpf TEXT,
  contato_nome TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT ALL ON public.fornecedores TO service_role;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read fornecedores" ON public.fornecedores FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "write fornecedores" ON public.fornecedores FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "update fornecedores" ON public.fornecedores FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor') OR public.has_role(auth.uid(),'financeiro')
);
CREATE POLICY "delete fornecedores" ON public.fornecedores FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER trg_fornecedores_updated BEFORE UPDATE ON public.fornecedores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Se já existe um usuário com email Fellipe@g3expresso.com.br sem papel admin, promover
DO $$
DECLARE _uid UUID;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE lower(email) = 'fellipe@g3expresso.com.br' LIMIT 1;
  IF _uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'administrador')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
