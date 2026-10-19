import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "G3 Expresso — Sistema de gestão e transporte" },
    { name: "description", content: "Acesso ao sistema de gestão de viagens, frota e operações da G3 Expresso." },
    { property: "og:title", content: "G3 Expresso — Sistema de gestão e transporte" },
    { property: "og:description", content: "Gestão de viagens, frota e operações da G3 Expresso." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
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
