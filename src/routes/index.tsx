import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    // O SDK do Supabase renova o token sozinho (autoRefreshToken) e serializa
    // as chamadas — não pedimos renovação manual aqui para não disputar o
    // mesmo refresh token e derrubar a sessão.
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/app" : "/auth" });
  },
  component: () => null,
});
