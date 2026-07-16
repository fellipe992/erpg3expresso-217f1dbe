import { MapPin, Fuel, CheckCircle2, Clock, TrendingUp, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export function MotoristaDashboard() {
  const { user } = useAuth();
  const nome = user?.email?.split("@")[0] ?? "motorista";

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Painel do motorista</div>
        <h1 className="font-display text-2xl font-bold capitalize">Olá, {nome}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suas viagens, abastecimentos e documentos.
        </p>
      </div>

      {/* Viagem atual */}
      <Card className="border-brand/40 bg-brand-subtle">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.14em] text-brand">Viagem em andamento</div>
            <Badge className="bg-brand text-brand-foreground">Ativa</Badge>
          </div>
          <div className="mt-2 font-display text-lg font-semibold">São Paulo → Curitiba</div>
          <div className="mt-1 text-xs text-muted-foreground">Iniciada há 3h 22min · KM 128.540</div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" disabled title="Em breve">
              Registrar abast.
            </Button>
            <Button size="sm" variant="outline" className="flex-1" disabled title="Em breve">
              Finalizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs motorista */}
      <div className="grid grid-cols-2 gap-3">
        <MiniKpi label="Viagens concluídas" value="14" icon={CheckCircle2} />
        <MiniKpi label="Em andamento" value="1" icon={Clock} />
        <MiniKpi label="KM no mês" value="4.820" icon={MapPin} />
        <MiniKpi label="Consumo médio" value="3,6 km/L" icon={TrendingUp} />
      </div>

      {/* Alertas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Alertas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0">
          <AlertRow icon={AlertCircle} tone="warn" title="CNH vence em 42 dias" description="Renovar até 27/08" />
          <AlertRow icon={Fuel} tone="info" title="Abastecimento pendente" description="Registro da última parada" />
        </CardContent>
      </Card>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        Módulos completos disponíveis nas próximas fases.
      </p>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <div className="mt-1 font-display text-xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function AlertRow({
  icon: Icon,
  tone,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "warn" | "info" | "danger";
  title: string;
  description: string;
}) {
  const bg = tone === "warn" ? "bg-warning/15 text-warning-foreground" : tone === "danger" ? "bg-destructive/15" : "bg-muted";
  const iconColor = tone === "warn" ? "text-warning" : tone === "danger" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className={`flex items-start gap-3 rounded-md p-3 ${bg}`}>
      <Icon className={`mt-0.5 size-4 ${iconColor}`} />
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}
