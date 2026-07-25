
-- 1) auditoria_insert_open: remover a política de INSERT do cliente.
-- Os registros de viagem_auditoria são gravados exclusivamente pelos gatilhos
-- SECURITY DEFINER (tg_viagem_auditoria, tg_checklist_auditoria,
-- tg_ocorrencia_auditoria), que rodam como owner e bypassam RLS.
DROP POLICY IF EXISTS "viagem_auditoria_insert_staff_or_owner" ON public.viagem_auditoria;

-- 2) inactive_user_session: revogar sessões/refresh tokens do Supabase Auth
-- quando profiles.ativo passa para false.
CREATE OR REPLACE FUNCTION public.tg_profiles_revoke_sessions_on_deactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.ativo, true) = true
     AND COALESCE(NEW.ativo, true) = false THEN
    -- Apaga refresh tokens e sessões ativas do usuário desativado.
    DELETE FROM auth.refresh_tokens WHERE user_id = NEW.id::text;
    DELETE FROM auth.sessions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_revoke_sessions_on_deactivate ON public.profiles;
CREATE TRIGGER trg_profiles_revoke_sessions_on_deactivate
AFTER UPDATE OF ativo ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.tg_profiles_revoke_sessions_on_deactivate();
