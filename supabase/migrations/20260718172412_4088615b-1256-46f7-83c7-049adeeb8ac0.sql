
CREATE TABLE public.usuarios_auditoria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id UUID NOT NULL,
  actor_user_id UUID,
  actor_email TEXT,
  acao TEXT NOT NULL,
  detalhes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.usuarios_auditoria TO authenticated;
GRANT ALL ON public.usuarios_auditoria TO service_role;

ALTER TABLE public.usuarios_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem auditoria" ON public.usuarios_auditoria
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Admins inserem auditoria" ON public.usuarios_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

CREATE INDEX idx_usuarios_auditoria_target ON public.usuarios_auditoria(target_user_id, created_at DESC);
