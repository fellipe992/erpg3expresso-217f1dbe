
-- ============ viagens: novas colunas ============
ALTER TABLE public.viagens
  ADD COLUMN IF NOT EXISTS iniciada_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS finalizada_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS observacoes_finais TEXT;

-- ============ checklists: campos específicos ============
ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS pneus_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS oleo_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS agua_radiador_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS freios_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS tacografo_ok BOOLEAN;

-- ============ viagem_ocorrencias ============
CREATE TABLE IF NOT EXISTS public.viagem_ocorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  motorista_id UUID REFERENCES public.motoristas(id),
  local TEXT,
  descricao TEXT NOT NULL,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagem_ocorrencias TO authenticated;
GRANT ALL ON public.viagem_ocorrencias TO service_role;
ALTER TABLE public.viagem_ocorrencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff full ocorrencias" ON public.viagem_ocorrencias
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "motorista read own ocorrencias" ON public.viagem_ocorrencias
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.viagens v
    WHERE v.id = viagem_ocorrencias.viagem_id
      AND v.motorista_id = public.current_motorista_id()
  ));

CREATE POLICY "motorista insert own ocorrencias" ON public.viagem_ocorrencias
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.viagens v
    WHERE v.id = viagem_ocorrencias.viagem_id
      AND v.motorista_id = public.current_motorista_id()
  ));

CREATE TRIGGER trg_ocorrencias_updated
  BEFORE UPDATE ON public.viagem_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ viagem_anexos ============
CREATE TABLE IF NOT EXISTS public.viagem_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  ocorrencia_id UUID REFERENCES public.viagem_ocorrencias(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL CHECK (categoria IN ('checklist_saida','checklist_chegada','ocorrencia','canhoto','entrega','veiculo','outro')),
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  descricao TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.viagem_anexos TO authenticated;
GRANT ALL ON public.viagem_anexos TO service_role;
ALTER TABLE public.viagem_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff full anexos" ON public.viagem_anexos
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "motorista read own anexos" ON public.viagem_anexos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.viagens v
    WHERE v.id = viagem_anexos.viagem_id
      AND v.motorista_id = public.current_motorista_id()
  ));

CREATE POLICY "motorista insert own anexos" ON public.viagem_anexos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.viagens v
    WHERE v.id = viagem_anexos.viagem_id
      AND v.motorista_id = public.current_motorista_id()
  ));

-- ============ viagem_auditoria ============
CREATE TABLE IF NOT EXISTS public.viagem_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  detalhes JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.viagem_auditoria TO authenticated;
GRANT ALL ON public.viagem_auditoria TO service_role;
ALTER TABLE public.viagem_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read auditoria" ON public.viagem_auditoria
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "motorista read own auditoria" ON public.viagem_auditoria
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.viagens v
    WHERE v.id = viagem_auditoria.viagem_id
      AND v.motorista_id = public.current_motorista_id()
  ));

CREATE POLICY "authenticated insert auditoria" ON public.viagem_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============ Triggers de auditoria automática ============
CREATE OR REPLACE FUNCTION public.tg_viagem_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.viagem_auditoria(viagem_id, evento, usuario_id, detalhes)
    VALUES (NEW.id, 'criada', auth.uid(),
      jsonb_build_object('status', NEW.status, 'codigo', NEW.codigo));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      IF NEW.status = 'em_andamento' THEN
        INSERT INTO public.viagem_auditoria(viagem_id, evento, usuario_id, detalhes)
        VALUES (NEW.id, 'iniciada', auth.uid(),
          jsonb_build_object('data_saida', NEW.data_saida, 'km_inicial', NEW.km_inicial));
      ELSIF NEW.status = 'concluida' THEN
        INSERT INTO public.viagem_auditoria(viagem_id, evento, usuario_id, detalhes)
        VALUES (NEW.id, 'finalizada', auth.uid(),
          jsonb_build_object('data_chegada', NEW.data_chegada, 'km_final', NEW.km_final));
      ELSIF NEW.status = 'cancelada' THEN
        INSERT INTO public.viagem_auditoria(viagem_id, evento, usuario_id, detalhes)
        VALUES (NEW.id, 'cancelada', auth.uid(), '{}'::jsonb);
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_viagem_auditoria ON public.viagens;
CREATE TRIGGER trg_viagem_auditoria
  AFTER INSERT OR UPDATE ON public.viagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_viagem_auditoria();

CREATE OR REPLACE FUNCTION public.tg_checklist_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.viagem_auditoria(viagem_id, evento, usuario_id, detalhes)
  VALUES (NEW.viagem_id, 'checklist_' || NEW.tipo, auth.uid(),
    jsonb_build_object('km', NEW.km));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_checklist_auditoria ON public.checklists;
CREATE TRIGGER trg_checklist_auditoria
  AFTER INSERT ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.tg_checklist_auditoria();

CREATE OR REPLACE FUNCTION public.tg_ocorrencia_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.viagem_auditoria(viagem_id, evento, usuario_id, detalhes)
  VALUES (NEW.viagem_id, 'ocorrencia', auth.uid(),
    jsonb_build_object('local', NEW.local, 'descricao', LEFT(NEW.descricao, 200)));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ocorrencia_auditoria ON public.viagem_ocorrencias;
CREATE TRIGGER trg_ocorrencia_auditoria
  AFTER INSERT ON public.viagem_ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.tg_ocorrencia_auditoria();

CREATE INDEX IF NOT EXISTS idx_viagem_anexos_viagem ON public.viagem_anexos(viagem_id);
CREATE INDEX IF NOT EXISTS idx_viagem_anexos_categoria ON public.viagem_anexos(viagem_id, categoria);
CREATE INDEX IF NOT EXISTS idx_viagem_ocorrencias_viagem ON public.viagem_ocorrencias(viagem_id);
CREATE INDEX IF NOT EXISTS idx_viagem_auditoria_viagem ON public.viagem_auditoria(viagem_id, created_at DESC);
