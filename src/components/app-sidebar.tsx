import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Truck,
  Users,
  MapPin,
  Fuel,
  Wrench,
  FileText,
  Settings,
  Wallet,
  Receipt,
  BarChart3,
  Building2,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Radar,
  Bell,
  Gauge,
  KanbanSquare,
  Calculator,
  MessagesSquare,
  Crosshair,
  Handshake,
  FileCheck2,




  MailPlus,
  CalendarDays,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/logo";
import { useAuth } from "@/hooks/use-auth";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  soon?: boolean;
};

const overview: NavItem[] = [
  { label: "Dashboard", to: "/app", icon: LayoutDashboard },
];

const financeiro: NavItem[] = [
  { label: "Fluxo de caixa", to: "/app/financeiro", icon: Wallet },
  { label: "Fechamento de viagens", to: "/app/fechamento", icon: FileCheck2 },
  { label: "Documentos fiscais", to: "/app/fiscal", icon: FileText },
  { label: "Contas a receber", to: "/app/receber", icon: Receipt },
  { label: "Contas a pagar", to: "/app/pagar", icon: Receipt },
  { label: "Rentabilidade", to: "/app/rentabilidade", icon: Gauge },
  { label: "Plano de contas", to: "/app/plano-contas", icon: BookOpen },
];



const operacional: NavItem[] = [
  { label: "Monitoramento", to: "/app/monitoramento", icon: Radar },
  { label: "Veículos", to: "/app/veiculos", icon: Truck },
  { label: "Frota por veículo", to: "/app/frota", icon: Gauge },
  { label: "Motoristas", to: "/app/motoristas", icon: Users },
  { label: "Clientes", to: "/app/clientes", icon: Building2 },
  { label: "Fornecedores", to: "/app/fornecedores", icon: Wrench },
  { label: "Viagens", to: "/app/viagens", icon: MapPin },
  { label: "Planejador de viagens", to: "/app/simulador", icon: Calculator },
  { label: "Roteirizador inteligente", to: "/app/roteirizador", icon: Radar },
  { label: "Abastecimentos", to: "/app/abastecimentos", icon: Fuel },
  { label: "Manutenções", to: "/app/manutencoes", icon: Wrench },
];

const comercial: NavItem[] = [
  { label: "Funil de vendas", to: "/app/crm/funil", icon: KanbanSquare },
  { label: "Leads pendentes", to: "/app/crm/leads", icon: MailPlus },
  { label: "Envios por dia", to: "/app/crm/envios", icon: CalendarDays },
  { label: "Hunter", to: "/app/crm/hunter", icon: Crosshair },
  { label: "Captação de parceiros", to: "/app/parceiros", icon: Handshake },
];


const gestao: NavItem[] = [
  { label: "Relatórios", to: "/app/relatorios", icon: BarChart3 },
  { label: "Assistente IA", to: "/app/assistente", icon: Sparkles },
  { label: "Documentos", to: "/app/documentos", icon: FileText },
  { label: "Avisos dos motoristas", to: "/app/avisos", icon: MessagesSquare },
  { label: "Notificações", to: "/app/notificacoes", icon: Bell },
];


const administracao: NavItem[] = [
  { label: "Empresas", to: "/app/empresa", icon: Building2 },
  { label: "Usuários", to: "/app/usuarios", icon: Users },
  { label: "Auditoria", to: "/app/auditoria", icon: ShieldCheck },
  { label: "Configurações", to: "/app/configuracoes", icon: Settings },
];

const gestorAdmin: NavItem[] = [
  { label: "Auditoria de viagens", to: "/app/auditoria", icon: ShieldCheck },
];

const monitorNav: NavItem[] = [
  { label: "Monitoramento", to: "/app/monitoramento", icon: Radar },
];

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const { role } = useAuth();
  const collapsed = state === "collapsed";
  useRealtimeSync();

  const isAdmin = role === "administrador";
  const isFinance = role === "financeiro" || isAdmin;
  const isGestor = role === "gestor";
  const isMonitor = role === "monitor";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex h-12 items-center gap-2 px-2">
          {collapsed ? <Logo variant="mark" size="sm" /> : <Logo size="sm" />}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {isMonitor ? (
          <Group label="Acompanhamento" items={monitorNav} pathname={location.pathname} collapsed={collapsed} />
        ) : (
          <>
            <>{!isGestor && <Group items={overview} pathname={location.pathname} collapsed={collapsed} />}</>
            {isFinance && <Group label="Financeiro" items={financeiro} pathname={location.pathname} collapsed={collapsed} />}
            <Group label="Operacional" items={operacional} pathname={location.pathname} collapsed={collapsed} />
            {!isGestor && <Group label="Comercial" items={comercial} pathname={location.pathname} collapsed={collapsed} />}
            <Group label="Gestão" items={gestao} pathname={location.pathname} collapsed={collapsed} />
            {isAdmin && <Group label="Administração" items={administracao} pathname={location.pathname} collapsed={collapsed} />}
            {isGestor && <Group label="Administração" items={gestorAdmin} pathname={location.pathname} collapsed={collapsed} />}
          </>
        )}
      </SidebarContent>


      <SidebarFooter>
        {!collapsed && (
          <div className="px-2 pb-2 text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60">
            v0.7 · Plano de Contas
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function Group({
  label,
  items,
  pathname,
  collapsed,
}: {
  label?: string;
  items: NavItem[];
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <SidebarGroup>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.label}
                  className={active ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                >
                  {item.soon ? (
                    <button
                      type="button"
                      className="opacity-60 cursor-not-allowed w-full text-left"
                      title="Em breve"
                    >
                      <item.icon className="size-4" />
                      <span className="flex-1">{item.label}</span>
                      {!collapsed && (
                        <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px] font-normal">
                          em breve
                        </Badge>
                      )}
                    </button>
                  ) : (
                    <Link to={item.to as never}>
                      <item.icon className="size-4" />
                      <span>{item.label}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
