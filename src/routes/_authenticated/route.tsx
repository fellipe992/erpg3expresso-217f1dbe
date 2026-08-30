import { createFileRoute, Navigate, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileMotoristaShell } from "@/components/mobile-motorista-shell";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NotificationsBell } from "@/components/notifications-bell";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Sessão persistente: só manda para /auth quando NÃO existe sessão salva
    // no aparelho. Falha de rede / token vencido não desloga o motorista —
    // o Supabase renova o token sozinho assim que a internet volta.
    const { data: sessionData } = await supabase.auth.getSession();
    let session = sessionData.session;
    if (!session) {
      const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }) as never);
      session = refreshed?.session ?? null;
    }
    if (!session) throw redirect({ to: "/auth" });
    return { user: session.user };
  },
  component: AuthenticatedLayout,
});


function AuthenticatedLayout() {
  const { role, roleLoading } = useAuth();
  const location = useLocation();

  if (roleLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  // Motorista: layout mobile-first, sem sidebar tradicional
  if (role === "motorista") {
    return <MobileMotoristaShell><Outlet /></MobileMotoristaShell>;
  }

  // Monitor (cliente): acesso exclusivo à Central de Monitoramento
  if (role === "monitor" && location.pathname !== "/app/monitoramento") {
    return <Navigate to="/app/monitoramento" replace />;
  }


  // Admin / Financeiro / Gestor: layout com sidebar
  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full max-w-full overflow-x-hidden">
        <AppSidebar />
        <SidebarInset className="min-w-0 max-w-full overflow-x-hidden">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border/60 bg-background/80 px-3 pt-safe backdrop-blur-md sm:gap-3 sm:px-4">
            <SidebarTrigger className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                {location.pathname === "/app" ? "Visão geral" : "Portal G3"}
              </div>
            </div>
            <ThemeToggle />
            {/* Monitor (cliente externo): sem notificações — apenas mapa e motoristas em viagem */}
            {role !== "monitor" && <NotificationsBell />}
            <UserMenu />
          </header>
          <main className="min-w-0 flex-1 bg-background pb-safe">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
