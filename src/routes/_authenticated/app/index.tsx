import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { AdminDashboard } from "@/components/dashboards/admin-dashboard";
import { MotoristaDashboard } from "@/components/dashboards/motorista-dashboard";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [{ title: "Dashboard — G3 Expresso" }] }),
  component: DashboardIndex,
});

function DashboardIndex() {
  const { role } = useAuth();
  if (role === "motorista") return <MotoristaDashboard />;
  // Gestor não tem acesso ao dashboard — direciona para operacional.
  if (role === "gestor") return <Navigate to="/app/viagens" replace />;
  return <AdminDashboard />;
}
