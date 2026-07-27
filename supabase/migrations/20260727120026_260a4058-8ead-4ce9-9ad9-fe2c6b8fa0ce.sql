-- ============ CRM: etapas do funil ============
CREATE TABLE public.crm_etapas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'aberta',
  cor TEXT NOT NULL DEFAULT '#7C7C7C',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_etapas TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.crm_etapas TO authenticated;
GRANT ALL ON public.crm_etapas TO service_role;
ALTER TABLE public.crm_etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_etapas_select" ON public.crm_etapas FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_etapas_manage" ON public.crm_etapas FOR ALL TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));

INSERT INTO public.crm_etapas (codigo, nome, ordem, tipo, cor) VALUES
  ('lead','Lead',1,'aberta','#7C7C7C'),
  ('primeiro_contato','Primeiro Contato',2,'aberta','#6B8AFD'),
  ('qualificacao','Qualificação',3,'aberta','#4FA3F7'),
  ('diagnostico','Diagnóstico',4,'aberta','#31B0C6'),
  ('proposta_enviada','Proposta Enviada',5,'aberta','#F1A424'),
  ('negociacao','Negociação',6,'aberta','#F15A24'),
  ('aguardando_cliente','Aguardando Cliente',7,'aberta','#C97BE0'),
  ('contrato','Contrato',8,'aberta','#7C5CFF'),
  ('fechado_ganho','Fechado Ganho',9,'ganho','#22A96B'),
  ('fechado_perdido','Fechado Perdido',10,'perdido','#E5484D');

-- ============ CRM: etiquetas ============
CREATE TABLE public.crm_etiquetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  cor TEXT NOT NULL DEFAULT '#F15A24',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_etiquetas TO authenticated;
GRANT ALL ON public.crm_etiquetas TO service_role;
ALTER TABLE public.crm_etiquetas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_etiquetas_select" ON public.crm_etiquetas FOR SELECT TO authenticated USING (true);
CREATE POLICY "crm_etiquetas_insert" ON public.crm_etiquetas FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "crm_etiquetas_update" ON public.crm_etiquetas FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "crm_etiquetas_delete" ON public.crm_etiquetas FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()));

-- ============ CRM: leads ============
CREATE TABLE public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa TEXT NOT NULL,
  contato_nome TEXT,
  cargo TEXT,
  telefone TEXT,
  whatsapp TEXT,
  email TEXT,
  cidade TEXT,
  uf TEXT,
  segmento TEXT,
  origem TEXT,
  cnpj_cpf TEXT,
  responsavel_id UUID,
  potencial_faturamento NUMERIC(14,2),
  classificacao TEXT,
  prioridade TEXT NOT NULL DEFAULT 'media',
  observacoes TEXT,
  etiquetas TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'aberto',
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ultimo_contato TIMESTAMPTZ,
  proximo_contato TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crm_leads_responsavel_idx ON public.crm_leads(responsavel_id);
CREATE INDEX crm_leads_status_idx ON public.crm_leads(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT ALL ON public.crm_leads TO service_role;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_leads_select" ON public.crm_leads FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) OR responsavel_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "crm_leads_insert" ON public.crm_leads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
CREATE POLICY "crm_leads_update" ON public.crm_leads FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()) OR responsavel_id = auth.uid() OR created_by = auth.uid())
  WITH CHECK (private.is_staff(auth.uid()) OR responsavel_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "crm_leads_delete" ON public.crm_leads FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()) OR created_by = auth.uid());

-- ============ CRM: oportunidades ============
CREATE TABLE public.crm_oportunidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  contato_nome TEXT,
  contato_telefone TEXT,
  contato_email TEXT,
  valor_estimado NUMERIC(14,2) NOT NULL DEFAULT 0,
  probabilidade INTEGER NOT NULL DEFAULT 50,
  responsavel_id UUID,
  data_prevista DATE,
  origem TEXT,
  descricao TEXT,
  servicos TEXT,
  etapa_id UUID NOT NULL REFERENCES public.crm_etapas(id),
  observacoes TEXT,
  motivo_perda TEXT,
  valor_fechado NUMERIC(14,2),
  fechada_em TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crm_oport_etapa_idx ON public.crm_oportunidades(etapa_id);
CREATE INDEX crm_oport_responsavel_idx ON public.crm_oportunidades(responsavel_id);
CREATE INDEX crm_oport_cliente_idx ON public.crm_oportunidades(cliente_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_oportunidades TO authenticated;
GRANT ALL ON public.crm_oportunidades TO service_role;
ALTER TABLE public.crm_oportunidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_oport_select" ON public.crm_oportunidades FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) OR responsavel_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "crm_oport_insert" ON public.crm_oportunidades FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
CREATE POLICY "crm_oport_update" ON public.crm_oportunidades FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid()) OR responsavel_id = auth.uid() OR created_by = auth.uid())
  WITH CHECK (private.is_staff(auth.uid()) OR responsavel_id = auth.uid() OR created_by = auth.uid());
CREATE POLICY "crm_oport_delete" ON public.crm_oportunidades FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()) OR created_by = auth.uid());

-- ============ CRM: timeline / atividades ============
CREATE TABLE public.crm_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  oportunidade_id UUID REFERENCES public.crm_oportunidades(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  usuario_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crm_ativ_lead_idx ON public.crm_atividades(lead_id);
CREATE INDEX crm_ativ_oport_idx ON public.crm_atividades(oportunidade_id);
CREATE INDEX crm_ativ_cliente_idx ON public.crm_atividades(cliente_id);
GRANT SELECT, INSERT ON public.crm_atividades TO authenticated;
GRANT ALL ON public.crm_atividades TO service_role;
ALTER TABLE public.crm_atividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_ativ_select" ON public.crm_atividades FOR SELECT TO authenticated
  USING (
    private.is_staff(auth.uid())
    OR usuario_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.crm_leads l WHERE l.id = crm_atividades.lead_id
                 AND (l.responsavel_id = auth.uid() OR l.created_by = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.crm_oportunidades o WHERE o.id = crm_atividades.oportunidade_id
                 AND (o.responsavel_id = auth.uid() OR o.created_by = auth.uid()))
  );
CREATE POLICY "crm_ativ_insert" ON public.crm_atividades FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND usuario_id = auth.uid());

-- ============ triggers ============
CREATE TRIGGER crm_etapas_updated_at BEFORE UPDATE ON public.crm_etapas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER crm_etiquetas_updated_at BEFORE UPDATE ON public.crm_etiquetas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER crm_leads_updated_at BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER crm_oport_updated_at BEFORE UPDATE ON public.crm_oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_crm_lead_timeline()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_atividades(tipo, titulo, descricao, lead_id, cliente_id, usuario_id, metadata)
    VALUES ('lead_criado','Lead criado', NEW.empresa, NEW.id, NEW.cliente_id, auth.uid(),
            jsonb_build_object('origem', NEW.origem));
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'convertido' THEN
    INSERT INTO public.crm_atividades(tipo, titulo, descricao, lead_id, cliente_id, usuario_id, metadata)
    VALUES ('lead_convertido','Lead convertido em cliente', NEW.empresa, NEW.id, NEW.cliente_id, auth.uid(), '{}'::jsonb);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_lead_timeline AFTER INSERT OR UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_lead_timeline();

CREATE OR REPLACE FUNCTION public.tg_crm_oport_timeline()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _de TEXT; _para TEXT; _tipo TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_atividades(tipo, titulo, descricao, lead_id, oportunidade_id, cliente_id, usuario_id, metadata)
    VALUES ('oportunidade_criada','Oportunidade criada', NEW.titulo, NEW.lead_id, NEW.id, NEW.cliente_id, auth.uid(),
            jsonb_build_object('valor', NEW.valor_estimado));
    RETURN NEW;
  END IF;
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id THEN
    SELECT nome INTO _de FROM public.crm_etapas WHERE id = OLD.etapa_id;
    SELECT nome, CASE tipo WHEN 'ganho' THEN 'negocio_ganho' WHEN 'perdido' THEN 'negocio_perdido' ELSE 'etapa_alterada' END
      INTO _para, _tipo FROM public.crm_etapas WHERE id = NEW.etapa_id;
    INSERT INTO public.crm_atividades(tipo, titulo, descricao, lead_id, oportunidade_id, cliente_id, usuario_id, metadata)
    VALUES (_tipo, 'Etapa alterada', COALESCE(_de,'?') || ' → ' || COALESCE(_para,'?'),
            NEW.lead_id, NEW.id, NEW.cliente_id, auth.uid(),
            jsonb_build_object('de', _de, 'para', _para));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_oport_timeline AFTER INSERT OR UPDATE ON public.crm_oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.tg_crm_oport_timeline();