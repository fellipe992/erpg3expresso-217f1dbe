ALTER TABLE public.roteirizacao_projetos
  ADD COLUMN IF NOT EXISTS criado_por_nome text,
  ADD COLUMN IF NOT EXISTS criado_por_cliente text;
