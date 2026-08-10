CREATE TABLE public.avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motorista_id uuid REFERENCES public.motoristas(id) ON DELETE SET NULL,
  veiculo_id uuid REFERENCES public.veiculos(id) ON DELETE SET NULL,
  viagem_id uuid REFERENCES public.viagens(id) ON DELETE SET NULL,
  categoria text NOT NULL DEFAULT 'geral',
  assunto text NOT NULL,
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.avisos_mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aviso_id uuid NOT NULL REFERENCES public.avisos(id) ON DELETE CASCADE,
  autor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mensagem text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX avisos_created_by_idx ON public.avisos(created_by);
CREATE INDEX avisos_status_idx ON public.avisos(status);
CREATE INDEX avisos_mensagens_aviso_idx ON public.avisos_mensagens(aviso_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.avisos TO authenticated;
GRANT ALL ON public.avisos TO service_role;
GRANT SELECT, INSERT ON public.avisos_mensagens TO authenticated;
GRANT ALL ON public.avisos_mensagens TO service_role;

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avisos_select" ON public.avisos FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR private.is_staff(auth.uid()));
CREATE POLICY "avisos_insert" ON public.avisos FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "avisos_update_staff" ON public.avisos FOR UPDATE TO authenticated
  USING (private.is_staff(auth.uid())) WITH CHECK (private.is_staff(auth.uid()));
CREATE POLICY "avisos_delete_staff" ON public.avisos FOR DELETE TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "avisos_msg_select" ON public.avisos_mensagens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.avisos a WHERE a.id = aviso_id
    AND (a.created_by = auth.uid() OR private.is_staff(auth.uid()))));
CREATE POLICY "avisos_msg_insert" ON public.avisos_mensagens FOR INSERT TO authenticated
  WITH CHECK (autor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.avisos a WHERE a.id = aviso_id
    AND (a.created_by = auth.uid() OR private.is_staff(auth.uid()))));

CREATE TRIGGER avisos_updated_at BEFORE UPDATE ON public.avisos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_aviso_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _u uuid; _nome text;
BEGIN
  SELECT COALESCE(p.nome, p.email) INTO _nome FROM public.profiles p WHERE p.id = NEW.created_by;
  FOR _u IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id = ur.user_id
    WHERE ur.role IN ('administrador','gestor') AND COALESCE(pr.ativo, true)
  LOOP
    PERFORM private.notificar(_u,'sistema','aviso_motorista',
      'Aviso de ' || COALESCE(_nome,'motorista'),
      NEW.assunto || ' — ' || left(NEW.mensagem, 140),
      '/app/avisos','aviso',NEW.id,'alta',0);
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER avisos_notificar AFTER INSERT ON public.avisos
  FOR EACH ROW EXECUTE FUNCTION public.tg_aviso_notificar();

CREATE OR REPLACE FUNCTION public.tg_aviso_mensagem_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _a public.avisos; _u uuid; _nome text;
BEGIN
  SELECT * INTO _a FROM public.avisos WHERE id = NEW.aviso_id;
  IF _a.id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(p.nome, p.email) INTO _nome FROM public.profiles p WHERE p.id = NEW.autor_id;

  IF NEW.autor_id = _a.created_by THEN
    FOR _u IN
      SELECT DISTINCT ur.user_id FROM public.user_roles ur
      JOIN public.profiles pr ON pr.id = ur.user_id
      WHERE ur.role IN ('administrador','gestor') AND COALESCE(pr.ativo, true)
    LOOP
      PERFORM private.notificar(_u,'sistema','aviso_resposta',
        'Nova mensagem de ' || COALESCE(_nome,'motorista'),
        left(NEW.mensagem, 160), '/app/avisos','aviso',_a.id,'alta',0);
    END LOOP;
  ELSE
    PERFORM private.notificar(_a.created_by,'sistema','aviso_resposta',
      'Resposta da operação', left(NEW.mensagem, 160), '/app/avisos','aviso',_a.id,'alta',0);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER avisos_mensagens_notificar AFTER INSERT ON public.avisos_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_aviso_mensagem_notificar();

CREATE OR REPLACE FUNCTION public.tg_aviso_status_notificar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM private.notificar(NEW.created_by,'sistema','aviso_status',
      'Aviso ' || NEW.status, NEW.assunto, '/app/avisos','aviso',NEW.id,'normal',0);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER avisos_status_notificar AFTER UPDATE ON public.avisos
  FOR EACH ROW EXECUTE FUNCTION public.tg_aviso_status_notificar();