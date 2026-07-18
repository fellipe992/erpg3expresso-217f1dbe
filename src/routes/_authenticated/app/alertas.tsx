import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, AlertCircle, Loader2, CalendarClock, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/app/alertas")({
  head: () => ({ meta: [{ title: "Alertas — G3 Expresso" }] }),
  component: AlertasPage,
});

type Alerta = {
  id: string;
  titulo: string;
  descricao: string;
  tone: "warn" | "danger" | "info";
  icon: typeof AlertCircle;
};

function AlertasPage() {
  const { user, role } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["alertas", user?.id, role],
    enabled: !!user?.id,
    queryFn: async () => {
      const hoje = new Date();
      const em60 = new Date(); em60.setDate(em60.getDate() + 60);
      const alertas: Alerta[] = [];

      if (role === "motorista") {
        const { data: mot } = await supabase
          .from("motoristas")
          .select("id, nome, cnh_validade, veiculo:veiculos(placa, licenciamento_validade, seguro_validade)")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (mot?.cnh_validade) {
          const d = new Date(mot.cnh_validade);
          const dias = Math.round((d.getTime() - hoje.getTime()) / 86400000);
          if (dias < 0) alertas.push({ id: "cnh", titulo: "CNH vencida", descricao: d.toLocaleDateString("pt-BR"), tone: "danger", icon: AlertCircle });
          else if (dias < 60) alertas.push({ id: "cnh", titulo: `CNH vence em ${dias} dias`, descricao: d.toLocaleDateString("pt-BR"), tone: "warn", icon: CalendarClock });
        }
        const v = mot?.veiculo as { placa: string; licenciamento_validade: string | null; seguro_validade: string | null } | null;
        if (v?.licenciamento_validade) {
          const d = new Date(v.licenciamento_validade);
          const dias = Math.round((d.getTime() - hoje.getTime()) / 86400000);
          if (dias < 60) alertas.push({ id: "lic", titulo: `Licenciamento ${v.placa} ${dias < 0 ? "vencido" : `em ${dias}d`}`, descricao: d.toLocaleDateString("pt-BR"), tone: dias < 0 ? "danger" : "warn", icon: CalendarClock });
        }
        if (v?.seguro_validade) {
          const d = new Date(v.seguro_validade);
          const dias = Math.round((d.getTime() - hoje.getTime()) / 86400000);
          if (dias < 60) alertas.push({ id: "seg", titulo: `Seguro ${v.placa} ${dias < 0 ? "vencido" : `em ${dias}d`}`, descricao: d.toLocaleDateString("pt-BR"), tone: dias < 0 ? "danger" : "warn", icon: CalendarClock });
        }
      } else {
        // staff: CNHs e veículos próximos do vencimento
        const [{ data: mots }, { data: veic }, { data: manut }] = await Promise.all([
          supabase.from("motoristas").select("id, nome, cnh_validade").eq("ativo", true),
          supabase.from("veiculos").select("id, placa, licenciamento_validade, seguro_validade").eq("ativo", true),
          supabase.from("manutencoes").select("id, tipo, data_proxima, veiculo:veiculos(placa)").not("data_proxima", "is", null),
        ]);
        for (const m of mots ?? []) {
          if (!m.cnh_validade) continue;
          const d = new Date(m.cnh_validade);
          const dias = Math.round((d.getTime() - hoje.getTime()) / 86400000);
          if (dias < 60) alertas.push({ id: `cnh-${m.id}`, titulo: `CNH de ${m.nome} ${dias < 0 ? "vencida" : `vence em ${dias}d`}`, descricao: d.toLocaleDateString("pt-BR"), tone: dias < 0 ? "danger" : "warn", icon: AlertCircle });
        }
        for (const v of veic ?? []) {
          for (const [campo, label] of [["licenciamento_validade", "Licenciamento"], ["seguro_validade", "Seguro"]] as const) {
            const val = (v as unknown as Record<string, string | null>)[campo];
            if (!val) continue;
            const d = new Date(val);
            const dias = Math.round((d.getTime() - hoje.getTime()) / 86400000);
            if (dias < 60) alertas.push({ id: `${campo}-${v.id}`, titulo: `${label} ${v.placa} ${dias < 0 ? "vencido" : `em ${dias}d`}`, descricao: d.toLocaleDateString("pt-BR"), tone: dias < 0 ? "danger" : "warn", icon: CalendarClock });
          }
        }
        for (const m of manut ?? []) {
          if (!m.data_proxima) continue;
          const d = new Date(m.data_proxima);
          const dias = Math.round((d.getTime() - hoje.getTime()) / 86400000);
          if (dias < 30) alertas.push({ id: `man-${m.id}`, titulo: `Manutenção ${m.tipo} - ${(m.veiculo as { placa?: string } | null)?.placa ?? ""} ${dias < 0 ? "atrasada" : `em ${dias}d`}`, descricao: d.toLocaleDateString("pt-BR"), tone: dias < 0 ? "danger" : "warn", icon: Wrench });
        }
      }
      return alertas;
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand/10">
          <Bell className="size-5 text-brand" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Notificações</div>
          <h1 className="font-display text-2xl font-bold">Alertas</h1>
        </div>
      </div>
      {isLoading ? (
        <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum alerta no momento.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {data.map((a) => {
            const Icon = a.icon;
            const bg = a.tone === "danger" ? "bg-destructive/10 border-destructive/30" : a.tone === "warn" ? "bg-warning/10 border-warning/30" : "bg-muted";
            const iconColor = a.tone === "danger" ? "text-destructive" : a.tone === "warn" ? "text-warning" : "text-muted-foreground";
            return (
              <Card key={a.id} className={bg}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon className={`mt-0.5 size-4 ${iconColor}`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.titulo}</div>
                    <div className="text-xs text-muted-foreground">{a.descricao}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{a.tone === "danger" ? "Urgente" : a.tone === "warn" ? "Aviso" : "Info"}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
