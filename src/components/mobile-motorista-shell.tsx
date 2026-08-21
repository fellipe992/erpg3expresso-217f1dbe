import { Link, useLocation, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, MapPin, Wallet, User, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { NotificationsBell } from "@/components/notifications-bell";
import { useMotoristaAutoTracking } from "@/hooks/use-viagem-tracking";
import { usePedidoPosicaoMotorista } from "@/hooks/use-pedido-posicao";
import type { ReactNode } from "react";

const tabs = [
  { to: "/app", label: "Início", icon: LayoutDashboard },
  { to: "/app/viagens", label: "Viagens", icon: MapPin },
  { to: "/app/custos", label: "Custos", icon: Wallet },
  { to: "/app/alertas", label: "Alertas", icon: Bell },
  { to: "/app/perfil", label: "Perfil", icon: User },
];

export function MobileMotoristaShell({ children }: { children?: ReactNode }) {
  const location = useLocation();
  useMotoristaAutoTracking();
  usePedidoPosicaoMotorista();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md">
        <Logo size="sm" />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <NotificationsBell />
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 pb-20">{children ?? <Outlet />}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-md">
        <ul className="grid grid-cols-5">
          {tabs.map((t) => {
            const active = location.pathname === t.to;
            const Icon = t.icon;
            return (
              <li key={t.to}>
                <Link to={t.to as never} className="block">
                  <div
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium",
                      active ? "text-brand" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" />
                    <span>{t.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
