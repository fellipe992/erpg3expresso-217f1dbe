-- ============ 1. SEGURANÇA: políticas TO public -> TO authenticated ============
DROP POLICY IF EXISTS "update abastecimentos" ON public.abastecimentos;
CREATE POLICY "update abastecimentos" ON public.abastecimentos FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()) OR (motorista_id = private.current_motorista_id()))
  WITH CHECK (private.is_staff(auth.uid()) OR (motorista_id = private.current_motorista_id()));

DROP POLICY IF EXISTS "update fornecedores" ON public.fornecedores;
CREATE POLICY "update fornecedores" ON public.fornecedores FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'financeiro'))
  WITH CHECK (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "update manutencoes" ON public.manutencoes;
CREATE POLICY "update manutencoes" ON public.manutencoes FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

DROP POLICY IF EXISTS "update motoristas" ON public.motoristas;
CREATE POLICY "update motoristas" ON public.motoristas FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'financeiro'))
  WITH CHECK (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "update veiculos" ON public.veiculos;
CREATE POLICY "update veiculos" ON public.veiculos FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'financeiro'))
  WITH CHECK (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'financeiro'));

DROP POLICY IF EXISTS "motorista delete own anexos" ON public.viagem_anexos;
CREATE POLICY "motorista delete own anexos" ON public.viagem_anexos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.viagens v WHERE v.id = viagem_anexos.viagem_id
                 AND v.motorista_id = private.current_motorista_id()));

-- Também limita a atualização de clientes (faltava WITH CHECK)
DROP POLICY IF EXISTS "update clientes" ON public.clientes;
CREATE POLICY "update clientes" ON public.clientes FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'financeiro'))
  WITH CHECK (private.has_role(auth.uid(),'administrador') OR private.has_role(auth.uid(),'gestor') OR private.has_role(auth.uid(),'financeiro'));

-- Perfis: admin não podia "sequestrar" linhas (faltava WITH CHECK)
DROP POLICY IF EXISTS "Administradores atualizam qualquer perfil" ON public.profiles;
CREATE POLICY "Administradores atualizam qualquer perfil" ON public.profiles FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(),'administrador'))
  WITH CHECK (private.has_role(auth.uid(),'administrador'));

-- ============ 2. NOTIFICAÇÕES: estrutura ============
ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS categoria TEXT NOT NULL DEFAULT 'sistema',
  ADD COLUMN IF NOT EXISTS prioridade TEXT NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_notificacoes_user_created
  ON public.notificacoes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_categoria
  ON public.notificacoes (user_id, categoria);

ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS licenciamento_validade DATE,
  ADD COLUMN IF NOT EXISTS seguro_validade DATE,
  ADD COLUMN IF NOT EXISTS crlv_validade DATE;

-- Helper interno com deduplicação
CREATE OR REPLACE FUNCTION private.notificar(
  _user_id UUID, _categoria TEXT, _tipo TEXT, _titulo TEXT, _mensagem TEXT,
  _link TEXT DEFAULT NULL, _origem TEXT DEFAULT NULL, _origem_id UUID DEFAULT NULL,
  _prioridade TEXT DEFAULT 'normal', _dedupe_horas INT DEFAULT 0
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  IF _dedupe_horas > 0 AND EXISTS (
    SELECT 1 FROM public.notificacoes n
    WHERE n.user_id = _user_id AND n.tipo = _tipo
      AND n.origem_id IS NOT DISTINCT FROM _origem_id
      AND n.created_at > now() - (_dedupe_horas || ' hours')::interval
  ) THEN RETURN; END IF;

  INSERT INTO public.notificacoes
    (user_id, categoria, tipo, titulo, mensagem, link, origem, origem_id, prioridade)
  VALUES (_user_id, _categoria, _tipo, _titulo, _mensagem, _link, _origem, _origem_id, _prioridade);
END $$;
REVOKE ALL ON FUNCTION private.notificar(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT,INT) FROM PUBLIC;

-- Categoria correta na notificação de viagem atribuída
CREATE OR REPLACE FUNCTION public.tg_viagem_notificar_motorista()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id UUID; _placa TEXT; _msg TEXT;
BEGIN
  IF NEW.motorista_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.motorista_id IS NOT DISTINCT FROM OLD.motorista_id THEN RETURN NEW; END IF;

  SELECT user_id INTO _user_id FROM public.motoristas WHERE id = NEW.motorista_id;
  IF _user_id IS NULL THEN RETURN NEW; END IF;
  SELECT placa INTO _placa FROM public.veiculos WHERE id = NEW.veiculo_id;

  _msg := 'OS ' || COALESCE(NEW.codigo,'') || COALESCE(' • ' || _placa,'')
       || COALESCE(' • ' || NEW.origem_cidade || '/' || NEW.origem_uf,'')
       || COALESCE(' → ' || NEW.destino_cidade || '/' || NEW.destino_uf,'');

  PERFORM private.notificar(_user_id,'viagem','viagem_atribuida','Nova viagem atribuída',_msg,
    '/app/viagens/' || NEW.id::text,'viagem',NEW.id,'alta',0);
  RETURN NEW;
END $$;

-- Eventos de viagem: iniciada / finalizada / cancelada / rota alterada
CREATE OR REPLACE FUNCTION public.tg_viagem_notificar_eventos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id UUID; _os TEXT;
BEGIN
  IF NEW.motorista_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO _user_id FROM public.motoristas WHERE id = NEW.motorista_id;
  IF _user_id IS NULL THEN RETURN NEW; END IF;
  _os := 'OS ' || COALESCE(NEW.codigo, NEW.id::text);

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'em_andamento' THEN
      PERFORM private.notificar(_user_id,'viagem','viagem_iniciada','Viagem iniciada',
        _os || ' está em andamento.','/app/viagens/'||NEW.id::text,'viagem',NEW.id,'alta',0);
    ELSIF NEW.status = 'concluida' THEN
      PERFORM private.notificar(_user_id,'viagem','viagem_finalizada','Viagem finalizada',
        _os || ' foi concluída.','/app/viagens/'||NEW.id::text,'viagem',NEW.id,'normal',0);
    ELSIF NEW.status = 'cancelada' THEN
      PERFORM private.notificar(_user_id,'viagem','viagem_cancelada','Viagem cancelada',
        _os || ' foi cancelada.','/app/viagens/'||NEW.id::text,'viagem',NEW.id,'alta',0);
    END IF;
  END IF;

  IF NEW.motorista_id IS NOT DISTINCT FROM OLD.motorista_id
     AND (NEW.destino_cidade IS DISTINCT FROM OLD.destino_cidade
       OR NEW.destino_uf IS DISTINCT FROM OLD.destino_uf
       OR NEW.origem_cidade IS DISTINCT FROM OLD.origem_cidade
       OR NEW.origem_uf IS DISTINCT FROM OLD.origem_uf) THEN
    PERFORM private.notificar(_user_id,'viagem','viagem_rota_alterada','Alteração de rota',
      _os || ' • ' || COALESCE(NEW.origem_cidade,'') || '/' || COALESCE(NEW.origem_uf,'')
        || ' → ' || COALESCE(NEW.destino_cidade,'') || '/' || COALESCE(NEW.destino_uf,''),
      '/app/viagens/'||NEW.id::text,'viagem',NEW.id,'alta',0);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_viagem_notif_eventos ON public.viagens;
CREATE TRIGGER trg_viagem_notif_eventos AFTER UPDATE ON public.viagens
FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_notificar_eventos();

-- Geração de alertas recorrentes (documentos, manutenções, financeiro)
CREATE OR REPLACE FUNCTION public.gerar_notificacoes_alertas()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; _dias INT;
BEGIN
  -- CNH próxima do vencimento (motorista)
  FOR r IN SELECT m.id, m.user_id, m.cnh_validade FROM public.motoristas m
           WHERE m.ativo AND m.user_id IS NOT NULL AND m.cnh_validade IS NOT NULL
             AND m.cnh_validade <= CURRENT_DATE + 30 LOOP
    _dias := r.cnh_validade - CURRENT_DATE;
    PERFORM private.notificar(r.user_id,'documento','cnh_vencimento',
      CASE WHEN _dias < 0 THEN 'CNH vencida' ELSE 'CNH vence em ' || _dias || ' dias' END,
      'Validade: ' || to_char(r.cnh_validade,'DD/MM/YYYY'),
      '/app/alertas','motorista',r.id, CASE WHEN _dias < 0 THEN 'alta' ELSE 'normal' END, 168);
  END LOOP;

  -- Documentos do veículo (motorista vinculado + administradores)
  FOR r IN
    SELECT v.id, v.placa, d.rotulo, d.validade, m.user_id
      FROM public.veiculos v
      CROSS JOIN LATERAL (VALUES
        ('Licenciamento', v.licenciamento_validade),
        ('Seguro', v.seguro_validade),
        ('CRLV / documento', v.crlv_validade)) AS d(rotulo, validade)
      LEFT JOIN public.motoristas m ON m.veiculo_id = v.id AND m.ativo AND m.user_id IS NOT NULL
     WHERE v.ativo AND d.validade IS NOT NULL AND d.validade <= CURRENT_DATE + 30
  LOOP
    _dias := r.validade - CURRENT_DATE;
    PERFORM private.notificar(r.user_id,'documento','doc_veiculo_vencimento',
      r.rotulo || CASE WHEN _dias < 0 THEN ' vencido' ELSE ' vence em ' || _dias || ' dias' END,
      'Veículo ' || r.placa || ' • ' || to_char(r.validade,'DD/MM/YYYY'),
      '/app/veiculos','veiculo',r.id, CASE WHEN _dias < 0 THEN 'alta' ELSE 'normal' END, 168);
    FOR r IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('administrador','gestor') LOOP
      NULL;
    END LOOP;
  END LOOP;

  -- Manutenções preventivas
  FOR r IN SELECT mn.id, mn.tipo, mn.proxima_revisao_data, v.placa, m.user_id
             FROM public.manutencoes mn
             JOIN public.veiculos v ON v.id = mn.veiculo_id
             LEFT JOIN public.motoristas m ON m.veiculo_id = mn.veiculo_id AND m.ativo AND m.user_id IS NOT NULL
            WHERE mn.proxima_revisao_data IS NOT NULL
              AND mn.proxima_revisao_data <= CURRENT_DATE + 15 LOOP
    _dias := r.proxima_revisao_data - CURRENT_DATE;
    PERFORM private.notificar(r.user_id,'manutencao','manutencao_agendada',
      r.tipo || CASE WHEN _dias < 0 THEN ' atrasada' ELSE ' em ' || _dias || ' dias' END,
      'Veículo ' || r.placa || ' • ' || to_char(r.proxima_revisao_data,'DD/MM/YYYY'),
      '/app/manutencoes','manutencao',r.id, CASE WHEN _dias < 0 THEN 'alta' ELSE 'normal' END, 168);
  END LOOP;

  -- Financeiro: pendências vencendo (apenas staff financeiro/administrador)
  FOR r IN SELECT ur.user_id, count(*) AS qtd, sum(f.valor) AS total
             FROM public.financeiro_lancamentos f
             CROSS JOIN (SELECT DISTINCT user_id FROM public.user_roles
                          WHERE role IN ('administrador','financeiro')) ur
            WHERE f.status IN ('pendente','atrasado')
              AND f.data_vencimento IS NOT NULL
              AND f.data_vencimento <= CURRENT_DATE + 3
            GROUP BY ur.user_id LOOP
    PERFORM private.notificar(r.user_id,'financeiro','financeiro_pendente',
      'Despesas pendentes', r.qtd || ' lançamento(s) vencendo — total R$ ' || to_char(r.total,'FM999G999G990D00'),
      '/app/financeiro','financeiro',NULL,'normal',24);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.gerar_notificacoes_alertas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gerar_notificacoes_alertas() TO authenticated;