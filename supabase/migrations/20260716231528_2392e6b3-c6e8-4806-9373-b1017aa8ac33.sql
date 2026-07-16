
CREATE TYPE public.financeiro_tipo AS ENUM ('receber', 'pagar');
CREATE TYPE public.financeiro_status AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado');
CREATE TYPE public.forma_pagamento AS ENUM ('dinheiro', 'pix', 'boleto', 'ted', 'cartao_credito', 'cartao_debito', 'cheque', 'outro');

CREATE TABLE public.financeiro_lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo public.financeiro_tipo NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor NUMERIC(12,2) NOT NULL,
  data_emissao DATE NOT NULL DEFAULT CURRENT_DATE,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  forma_pagamento public.forma_pagamento,
  status public.financeiro_status NOT NULL DEFAULT 'pendente',
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE SET NULL,
  numero_documento TEXT,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_lancamentos TO authenticated;
GRANT ALL ON public.financeiro_lancamentos TO service_role;

ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff vê financeiro" ON public.financeiro_lancamentos
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff cria financeiro" ON public.financeiro_lancamentos
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Staff edita financeiro" ON public.financeiro_lancamentos
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Admin exclui financeiro" ON public.financeiro_lancamentos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'));

CREATE TRIGGER update_financeiro_updated_at
  BEFORE UPDATE ON public.financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_fin_tipo_status ON public.financeiro_lancamentos(tipo, status);
CREATE INDEX idx_fin_vencimento ON public.financeiro_lancamentos(data_vencimento);
CREATE INDEX idx_fin_cliente ON public.financeiro_lancamentos(cliente_id);
CREATE INDEX idx_fin_fornecedor ON public.financeiro_lancamentos(fornecedor_id);
CREATE INDEX idx_fin_viagem ON public.financeiro_lancamentos(viagem_id);

-- Função para marcar lançamentos vencidos automaticamente
CREATE OR REPLACE FUNCTION public.marcar_atrasados()
RETURNS void LANGUAGE SQL SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.financeiro_lancamentos
  SET status = 'atrasado'
  WHERE status = 'pendente' AND data_vencimento < CURRENT_DATE;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_atrasados() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_atrasados() TO authenticated;
