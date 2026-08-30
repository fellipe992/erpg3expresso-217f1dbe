import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    let session = data.session;
    if (!session) {
      const { data: refreshed } = await supabase.auth
        .refreshSession()
        .catch(() => ({ data: { session: null } }) as never);
      session = refreshed?.session ?? null;
    }
    throw redirect({ to: session ? "/app" : "/auth" });
  },
  component: () => null,
});
