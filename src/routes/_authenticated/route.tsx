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
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
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
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md">
            <SidebarTrigger />
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                {location.pathname === "/app" ? "Visão geral" : "Portal G3"}
              </div>
            </div>
            <ThemeToggle />
            {/* Monitor (cliente externo): sem notificações — apenas mapa e motoristas em viagem */}
            {role !== "monitor" && <NotificationsBell />}
            <UserMenu />
          </header>
          <main className="flex-1 bg-background">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
