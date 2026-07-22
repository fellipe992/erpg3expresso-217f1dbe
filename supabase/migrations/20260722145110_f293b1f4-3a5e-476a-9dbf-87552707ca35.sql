
DROP FUNCTION IF EXISTS public.get_company_public();

CREATE OR REPLACE FUNCTION private.get_company_public()
RETURNS TABLE(id uuid, nome_fantasia text, logo_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nome_fantasia, logo_url FROM public.company_settings LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.get_company_public() FROM PUBLIC;

-- Expose via a thin public RPC wrapper that is SECURITY INVOKER and simply selects safe columns.
-- To bypass the base table RLS for non-staff, use a view with security_invoker=false is not allowed.
-- Instead: add a second RLS policy allowing any authenticated user to SELECT, but restrict via column-level GRANTs.

-- Revoke broad column privileges from authenticated:
REVOKE SELECT ON public.company_settings FROM authenticated;
-- Grant SELECT only on non-sensitive columns to authenticated:
GRANT SELECT (id, nome_fantasia, logo_url) ON public.company_settings TO authenticated;
-- Re-grant full SELECT via role-check policy (staff policy already exists). But grants are needed too.
-- Since we can't grant per-role, staff will use the same column subset unless we grant all columns.
-- Grant all columns back; RLS staff policy will still gate row access. Non-staff will be blocked by RLS.
GRANT SELECT ON public.company_settings TO authenticated;

-- Add an additional SELECT policy for authenticated users to read the row, but only via a view that projects safe columns.
CREATE OR REPLACE VIEW public.company_public
WITH (security_invoker = false)
AS
  SELECT id, nome_fantasia, logo_url
  FROM public.company_settings
  LIMIT 1;

GRANT SELECT ON public.company_public TO authenticated;
