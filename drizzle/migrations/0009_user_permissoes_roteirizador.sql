-- Permissões extras por usuário (além do perfil/role)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_permissao') THEN
    CREATE TYPE public.app_permissao AS ENUM ('roteirizador');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_permissoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permissao public.app_permissao NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permissao)
);

GRANT SELECT ON public.user_permissoes TO authenticated;
GRANT ALL ON public.user_permissoes TO service_role;

ALTER TABLE public.user_permissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem próprias permissões" ON public.user_permissoes;
CREATE POLICY "Usuários veem próprias permissões"
ON public.user_permissoes FOR SELECT TO authenticated
USING (auth.uid() = user_id OR private.has_role(auth.uid(), 'administrador'::app_role));

DROP POLICY IF EXISTS "Administradores gerenciam permissões" ON public.user_permissoes;
CREATE POLICY "Administradores gerenciam permissões"
ON public.user_permissoes FOR ALL TO authenticated
USING (private.has_role(auth.uid(), 'administrador'::app_role))
WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role));

CREATE OR REPLACE FUNCTION private.tem_permissao(_user_id uuid, _perm public.app_permissao)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_permissoes
    WHERE user_id = _user_id AND permissao = _perm
  )
$$;

REVOKE ALL ON FUNCTION private.tem_permissao(uuid, public.app_permissao) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.tem_permissao(uuid, public.app_permissao) TO authenticated, service_role;

-- Projetos de roteirização: dono com permissão gerencia os próprios projetos
DROP POLICY IF EXISTS "Dono com permissao gerencia proprios projetos" ON public.roteirizacao_projetos;
CREATE POLICY "Dono com permissao gerencia proprios projetos"
ON public.roteirizacao_projetos FOR ALL TO authenticated
USING (created_by = auth.uid() AND private.tem_permissao(auth.uid(), 'roteirizador'::public.app_permissao))
WITH CHECK (created_by = auth.uid() AND private.tem_permissao(auth.uid(), 'roteirizador'::public.app_permissao));
