DO $$ BEGIN CREATE TYPE public.prazo_pagamento AS ENUM ('a_vista','semanal','quinzenal_imediato','quinzenal_casa','dias'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS prazo_pagamento public.prazo_pagamento NOT NULL DEFAULT 'quinzenal_casa';
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS prazo_dias integer;
ALTER TABLE public.motoristas ADD COLUMN IF NOT EXISTS prazo_pagamento public.prazo_pagamento NOT NULL DEFAULT 'dias';
ALTER TABLE public.motoristas ADD COLUMN IF NOT EXISTS prazo_dias integer DEFAULT 30;