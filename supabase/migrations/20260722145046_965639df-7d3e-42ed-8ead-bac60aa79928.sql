
-- Restrict SELECT on company_settings sensitive fields to staff roles.
DROP POLICY IF EXISTS "Autenticados leem config empresa" ON public.company_settings;

CREATE POLICY "Staff leem config empresa"
  ON public.company_settings
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'administrador'::app_role)
    OR private.has_role(auth.uid(), 'financeiro'::app_role)
    OR private.has_role(auth.uid(), 'gestor'::app_role)
  );

-- Public-safe view for non-sensitive display fields (name + logo) usable by any authenticated user.
CREATE OR REPLACE VIEW public.company_public
WITH (security_invoker = true)
AS
  SELECT id, nome_fantasia, logo_url
  FROM public.company_settings;

-- Allow the view to be readable by any authenticated user; underlying RLS still applies via security_invoker,
-- so we need a matching SELECT policy on the base table for the projected columns.
-- Add a permissive SELECT policy that only exposes non-sensitive columns is not possible with RLS,
-- so instead grant SELECT on the view through a SECURITY DEFINER function.
DROP VIEW IF EXISTS public.company_public;

CREATE OR REPLACE FUNCTION public.get_company_public()
RETURNS TABLE(id uuid, nome_fantasia text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nome_fantasia, logo_url FROM public.company_settings LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_company_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_public() TO authenticated;
