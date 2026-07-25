
-- 1. Drop open insert policy on viagem_auditoria
DROP POLICY IF EXISTS "authenticated insert auditoria" ON public.viagem_auditoria;

-- 2. Restrict system_settings SELECT to staff
DROP POLICY IF EXISTS "Autenticados leem system_settings" ON public.system_settings;
CREATE POLICY "Staff lê system_settings" ON public.system_settings
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

-- 3. Enforce profiles.ativo in permission helpers so deactivated users lose access immediately
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND COALESCE(p.ativo, true) = true
  )
$$;

CREATE OR REPLACE FUNCTION private.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('administrador','gestor','financeiro')
      AND COALESCE(p.ativo, true) = true
  )
$$;

CREATE OR REPLACE FUNCTION private.current_motorista_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id
  FROM public.motoristas m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.user_id = auth.uid()
    AND COALESCE(p.ativo, true) = true
  LIMIT 1
$$;
