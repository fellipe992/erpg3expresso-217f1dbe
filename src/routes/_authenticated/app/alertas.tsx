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

type Tone = "warn" | "danger" | "info";
type Alerta = { id: string; titulo: string; descricao: string; tone: Tone; kind: "cnh" | "manut" };

function diasAte(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

function AlertasPage() {
  const { user, role } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["alertas", user?.id, role],
    enabled: !!user?.id,
    queryFn: async () => {
      const alertas: Alerta[] = [];

      if (role === "motorista") {
        const { data: mot } = await supabase
          .from("motoristas")
          .select("id, nome, cnh_validade, veiculo_id")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (mot?.cnh_validade) {
          const dias = diasAte(mot.cnh_validade);
          if (dias < 60) alertas.push({
            id: "cnh", kind: "cnh",
            titulo: dias < 0 ? "CNH vencida" : `CNH vence em ${dias} dias`,
            descricao: new Date(mot.cnh_validade).toLocaleDateString("pt-BR"),
            tone: dias < 0 ? "danger" : "warn",
          });
        }
        if (mot?.veiculo_id) {
          const { data: manut } = await supabase
            .from("manutencoes")
            .select("id, tipo, proxima_revisao_data, veiculo:veiculos(placa)")
            .eq("veiculo_id", mot.veiculo_id)
            .not("proxima_revisao_data", "is", null);
          for (const m of manut ?? []) {
            if (!m.proxima_revisao_data) continue;
            const dias = diasAte(m.proxima_revisao_data);
            if (dias < 30) alertas.push({
              id: `man-${m.id}`, kind: "manut",
              titulo: `${m.tipo} - ${(m.veiculo as { placa?: string } | null)?.placa ?? ""} ${dias < 0 ? "atrasada" : `em ${dias}d`}`,
              descricao: new Date(m.proxima_revisao_data).toLocaleDateString("pt-BR"),
              tone: dias < 0 ? "danger" : "warn",
            });
          }
        }
      } else {
        const [{ data: mots }, { data: manut }] = await Promise.all([
          supabase.from("motoristas").select("id, nome, cnh_validade").eq("ativo", true).not("cnh_validade", "is", null),
          supabase.from("manutencoes").select("id, tipo, proxima_revisao_data, veiculo:veiculos(placa)").not("proxima_revisao_data", "is", null),
        ]);
        for (const m of mots ?? []) {
          if (!m.cnh_validade) continue;
          const dias = diasAte(m.cnh_validade);
          if (dias < 60) alertas.push({
            id: `cnh-${m.id}`, kind: "cnh",
            titulo: `CNH de ${m.nome} ${dias < 0 ? "vencida" : `vence em ${dias}d`}`,
            descricao: new Date(m.cnh_validade).toLocaleDateString("pt-BR"),
            tone: dias < 0 ? "danger" : "warn",
          });
        }
        for (const m of manut ?? []) {
          if (!m.proxima_revisao_data) continue;
          const dias = diasAte(m.proxima_revisao_data);
          if (dias < 30) alertas.push({
            id: `man-${m.id}`, kind: "manut",
            titulo: `${m.tipo} - ${(m.veiculo as { placa?: string } | null)?.placa ?? ""} ${dias < 0 ? "atrasada" : `em ${dias}d`}`,
            descricao: new Date(m.proxima_revisao_data).toLocaleDateString("pt-BR"),
            tone: dias < 0 ? "danger" : "warn",
          });
        }
      }
      return alertas.sort((a, b) => (a.tone === "danger" ? -1 : b.tone === "danger" ? 1 : 0));
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
            const Icon = a.kind === "manut" ? Wrench : a.tone === "danger" ? AlertCircle : CalendarClock;
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
                  <Badge variant="outline" className="text-[10px]">{a.tone === "danger" ? "Urgente" : "Aviso"}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
