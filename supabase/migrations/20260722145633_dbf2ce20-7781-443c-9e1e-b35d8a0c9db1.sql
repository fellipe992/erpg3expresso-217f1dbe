
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  moeda text NOT NULL DEFAULT 'BRL',
  casas_decimais smallint NOT NULL DEFAULT 2,
  default_theme text NOT NULL DEFAULT 'system',
  dias_alerta_vencer smallint NOT NULL DEFAULT 7,
  dias_alerta_atraso smallint NOT NULL DEFAULT 3,
  prazo_padrao_vencimento smallint NOT NULL DEFAULT 30,
  notif_config jsonb NOT NULL DEFAULT jsonb_build_object(
    'motorista', jsonb_build_object('nova_viagem', true, 'atualizacao_viagem', true),
    'financeiro', jsonb_build_object('vencendo', true, 'atrasado', true),
    'gestor', jsonb_build_object('manutencao', true, 'ocorrencia', true),
    'administrador', jsonb_build_object('tudo', true)
  ),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.system_settings TO authenticated;
GRANT UPDATE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem system_settings"
  ON public.system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin edita system_settings"
  ON public.system_settings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'administrador'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'administrador'::app_role));

CREATE TRIGGER trg_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.system_settings (singleton) VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;
