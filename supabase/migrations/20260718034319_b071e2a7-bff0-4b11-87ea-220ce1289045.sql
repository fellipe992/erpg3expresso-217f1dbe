
-- ============ MOTORISTAS: veiculo_id + único ativo ============
ALTER TABLE public.motoristas
  ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES public.veiculos(id) ON DELETE SET NULL;

-- Índice: apenas um motorista ATIVO por veículo
CREATE UNIQUE INDEX IF NOT EXISTS motoristas_veiculo_ativo_uidx
  ON public.motoristas (veiculo_id)
  WHERE ativo = true AND veiculo_id IS NOT NULL;

-- Índice: cada motorista referencia no máx 1 user_id
CREATE UNIQUE INDEX IF NOT EXISTS motoristas_user_id_uidx
  ON public.motoristas (user_id)
  WHERE user_id IS NOT NULL;

-- ============ PROFILES: status ativo/inativo ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

-- ============ HISTÓRICO DE VÍNCULOS ============
CREATE TABLE IF NOT EXISTS public.motorista_veiculo_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID NOT NULL REFERENCES public.motoristas(id) ON DELETE CASCADE,
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE RESTRICT,
  data_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_fim TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','encerrado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.motorista_veiculo_historico TO authenticated;
GRANT ALL ON public.motorista_veiculo_historico TO service_role;

ALTER TABLE public.motorista_veiculo_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read historico vinc"  ON public.motorista_veiculo_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY "write historico vinc" ON public.motorista_veiculo_historico FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE POLICY "update historico vinc" ON public.motorista_veiculo_historico FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

CREATE TRIGGER trg_hist_vinc_updated BEFORE UPDATE ON public.motorista_veiculo_historico
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: manutenir histórico
CREATE OR REPLACE FUNCTION public.tg_motorista_vinculo()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- INSERT com veiculo_id
  IF TG_OP = 'INSERT' THEN
    IF NEW.veiculo_id IS NOT NULL AND NEW.ativo THEN
      INSERT INTO public.motorista_veiculo_historico(motorista_id, veiculo_id, status)
      VALUES (NEW.id, NEW.veiculo_id, 'ativo');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: mudança de veículo ou ativo
  IF TG_OP = 'UPDATE' THEN
    IF NEW.veiculo_id IS DISTINCT FROM OLD.veiculo_id
       OR NEW.ativo IS DISTINCT FROM OLD.ativo THEN
      -- Encerra vínculo ativo anterior
      UPDATE public.motorista_veiculo_historico
        SET status='encerrado', data_fim=now()
        WHERE motorista_id = NEW.id AND status='ativo';
      -- Abre novo se aplicável
      IF NEW.veiculo_id IS NOT NULL AND NEW.ativo THEN
        INSERT INTO public.motorista_veiculo_historico(motorista_id, veiculo_id, status)
        VALUES (NEW.id, NEW.veiculo_id, 'ativo');
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_motorista_vinculo ON public.motoristas;
CREATE TRIGGER trg_motorista_vinculo
  AFTER INSERT OR UPDATE ON public.motoristas
  FOR EACH ROW EXECUTE FUNCTION public.tg_motorista_vinculo();

-- ============ ABASTECIMENTOS ============
CREATE TABLE IF NOT EXISTS public.abastecimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE RESTRICT,
  motorista_id UUID REFERENCES public.motoristas(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  hora TIME,
  posto TEXT,
  combustivel TEXT,
  litros NUMERIC(10,3) NOT NULL,
  valor_litro NUMERIC(10,3) NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL,
  km_atual NUMERIC(12,1) NOT NULL,
  km_percorridos NUMERIC(12,1),
  consumo_medio NUMERIC(10,2),
  custo_por_km NUMERIC(10,3),
  observacoes TEXT,
  comprovante_path TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abast_veiculo_data_idx ON public.abastecimentos(veiculo_id, data DESC, hora DESC);
CREATE INDEX IF NOT EXISTS abast_motorista_idx ON public.abastecimentos(motorista_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.abastecimentos TO authenticated;
GRANT ALL ON public.abastecimentos TO service_role;

ALTER TABLE public.abastecimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read abastecimentos" ON public.abastecimentos FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR motorista_id = public.current_motorista_id()
);
CREATE POLICY "insert abastecimentos" ON public.abastecimentos FOR INSERT TO authenticated WITH CHECK (
  public.is_staff(auth.uid())
  OR motorista_id = public.current_motorista_id()
);
CREATE POLICY "update abastecimentos" ON public.abastecimentos FOR UPDATE TO authenticated USING (
  public.is_staff(auth.uid())
  OR motorista_id = public.current_motorista_id()
);
CREATE POLICY "delete abastecimentos" ON public.abastecimentos FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(),'administrador')
);

CREATE TRIGGER trg_abast_updated BEFORE UPDATE ON public.abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: calcular km_percorridos / consumo / custo/km baseado no abastecimento anterior
CREATE OR REPLACE FUNCTION public.tg_abastecimento_calc()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _prev_km NUMERIC;
BEGIN
  SELECT km_atual INTO _prev_km
  FROM public.abastecimentos
  WHERE veiculo_id = NEW.veiculo_id
    AND (data < NEW.data OR (data = NEW.data AND (hora IS NULL OR hora < COALESCE(NEW.hora, '23:59'::time))))
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY data DESC, hora DESC NULLS LAST
  LIMIT 1;

  IF _prev_km IS NOT NULL AND NEW.km_atual > _prev_km THEN
    NEW.km_percorridos := NEW.km_atual - _prev_km;
    IF NEW.litros > 0 THEN
      NEW.consumo_medio := ROUND((NEW.km_percorridos / NEW.litros)::numeric, 2);
    END IF;
    IF NEW.km_percorridos > 0 THEN
      NEW.custo_por_km := ROUND((NEW.valor_total / NEW.km_percorridos)::numeric, 3);
    END IF;
  ELSE
    NEW.km_percorridos := NULL;
    NEW.consumo_medio := NULL;
    NEW.custo_por_km := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_abast_calc BEFORE INSERT OR UPDATE ON public.abastecimentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_abastecimento_calc();

-- ============ MANUTENÇÕES ============
CREATE TABLE IF NOT EXISTS public.manutencoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id UUID NOT NULL REFERENCES public.veiculos(id) ON DELETE RESTRICT,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  km_atual NUMERIC(12,1),
  tipo TEXT NOT NULL,
  oficina TEXT,
  descricao TEXT,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  proxima_revisao_data DATE,
  proxima_revisao_km NUMERIC(12,1),
  nota_path TEXT,
  observacoes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manut_veiculo_data_idx ON public.manutencoes(veiculo_id, data DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencoes TO authenticated;
GRANT ALL ON public.manutencoes TO service_role;

ALTER TABLE public.manutencoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read manutencoes" ON public.manutencoes FOR SELECT TO authenticated USING (
  public.is_staff(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.motoristas m
    WHERE m.user_id = auth.uid() AND m.veiculo_id = manutencoes.veiculo_id
  )
);
CREATE POLICY "insert manutencoes" ON public.manutencoes FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "update manutencoes" ON public.manutencoes FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "delete manutencoes" ON public.manutencoes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'administrador'));

CREATE TRIGGER trg_manut_updated BEFORE UPDATE ON public.manutencoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STORAGE POLICIES ============
-- abastecimento-comprovantes: staff full; motorista lê/escreve seus próprios
CREATE POLICY "abast comprov read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'abastecimento-comprovantes' AND (public.is_staff(auth.uid()) OR owner = auth.uid()));
CREATE POLICY "abast comprov insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'abastecimento-comprovantes' AND (public.is_staff(auth.uid()) OR owner = auth.uid()));
CREATE POLICY "abast comprov update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'abastecimento-comprovantes' AND (public.is_staff(auth.uid()) OR owner = auth.uid()));
CREATE POLICY "abast comprov delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'abastecimento-comprovantes' AND public.has_role(auth.uid(),'administrador'));

-- manutencao-notas: apenas staff
CREATE POLICY "manut nota read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'manutencao-notas' AND public.is_staff(auth.uid()));
CREATE POLICY "manut nota insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'manutencao-notas' AND public.is_staff(auth.uid()));
CREATE POLICY "manut nota update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'manutencao-notas' AND public.is_staff(auth.uid()));
CREATE POLICY "manut nota delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'manutencao-notas' AND public.has_role(auth.uid(),'administrador'));

-- ============ Backfill: histórico para motoristas já com veículo ============
INSERT INTO public.motorista_veiculo_historico(motorista_id, veiculo_id, status)
SELECT id, veiculo_id, 'ativo'
FROM public.motoristas
WHERE veiculo_id IS NOT NULL AND ativo = true
  AND NOT EXISTS (
    SELECT 1 FROM public.motorista_veiculo_historico h
    WHERE h.motorista_id = motoristas.id AND h.status = 'ativo'
  );
