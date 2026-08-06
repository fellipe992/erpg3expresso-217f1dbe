-- 1) Veículo agregado
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS agregado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proprietario_nome TEXT,
  ADD COLUMN IF NOT EXISTS proprietario_documento TEXT,
  ADD COLUMN IF NOT EXISTS proprietario_telefone TEXT;

-- 2) Vínculo monitor -> cliente
CREATE TABLE IF NOT EXISTS public.monitor_clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, cliente_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monitor_clientes TO authenticated;
GRANT ALL ON public.monitor_clientes TO service_role;

ALTER TABLE public.monitor_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin gerencia monitor_clientes" ON public.monitor_clientes;
CREATE POLICY "admin gerencia monitor_clientes" ON public.monitor_clientes
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role));

DROP POLICY IF EXISTS "monitor le proprio vinculo" ON public.monitor_clientes;
CREATE POLICY "monitor le proprio vinculo" ON public.monitor_clientes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_monitor_clientes_updated ON public.monitor_clientes;
CREATE TRIGGER trg_monitor_clientes_updated
  BEFORE UPDATE ON public.monitor_clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Helper: o usuário é monitor do cliente informado?
CREATE OR REPLACE FUNCTION private.is_monitor_cliente(_user_id UUID, _cliente_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _cliente_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.monitor_clientes mc
     WHERE mc.user_id = _user_id AND mc.cliente_id = _cliente_id
  )
$$;

REVOKE ALL ON FUNCTION private.is_monitor_cliente(UUID, UUID) FROM PUBLIC;

-- 4) Posições em tempo real visíveis ao monitor do cliente da viagem
DROP POLICY IF EXISTS "monitor read localizacoes do cliente" ON public.viagem_localizacoes;
CREATE POLICY "monitor read localizacoes do cliente" ON public.viagem_localizacoes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.viagens v
     WHERE v.id = viagem_localizacoes.viagem_id
       AND v.status = 'em_andamento'
       AND private.is_monitor_cliente(auth.uid(), v.cliente_id)
  ));

-- 5) Consulta de monitoramento (staff = tudo; monitor = apenas seus clientes)
CREATE OR REPLACE FUNCTION public.monitoramento_viagens_ativas()
RETURNS TABLE (
  id UUID,
  codigo TEXT,
  origem_cidade TEXT,
  origem_uf TEXT,
  destino_cidade TEXT,
  destino_uf TEXT,
  data_saida TIMESTAMPTZ,
  km_inicial NUMERIC,
  cliente_nome TEXT,
  motorista_id UUID,
  motorista_nome TEXT,
  motorista_telefone TEXT,
  veiculo_id UUID,
  veiculo_placa TEXT,
  veiculo_modelo TEXT,
  veiculo_marca TEXT,
  veiculo_agregado BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.id, v.codigo, v.origem_cidade, v.origem_uf, v.destino_cidade, v.destino_uf,
         v.data_saida, v.km_inicial,
         c.razao_social,
         m.id, m.nome, CASE WHEN private.is_staff(auth.uid()) THEN m.telefone ELSE NULL END,
         ve.id, ve.placa, ve.modelo, ve.marca, ve.agregado
    FROM public.viagens v
    LEFT JOIN public.clientes c ON c.id = v.cliente_id
    LEFT JOIN public.motoristas m ON m.id = v.motorista_id
    LEFT JOIN public.veiculos ve ON ve.id = v.veiculo_id
   WHERE v.status = 'em_andamento'
     AND (
       private.is_staff(auth.uid())
       OR private.is_monitor_cliente(auth.uid(), v.cliente_id)
     )
$$;

REVOKE ALL ON FUNCTION public.monitoramento_viagens_ativas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.monitoramento_viagens_ativas() TO authenticated;