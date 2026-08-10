import { useQuery } from "@tanstack/react-query";
import { MapPin, Fuel, CheckCircle2, Clock, TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

type ViagemLite = {
  id: string;
  status: string;
  origem_cidade: string | null;
  origem_uf: string | null;
  destino_cidade: string | null;
  destino_uf: string | null;
  data_saida: string | null;
  km_inicial: number | null;
  km_final: number | null;
  created_at: string;
};

export function MotoristaDashboard() {
  const { user } = useAuth();
  const nome = user?.email?.split("@")[0] ?? "motorista";

  const inicioMes = new Date();
  inicioMes.setDate(1);
  const inicioMesStr = inicioMes.toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["motorista-dashboard", user?.id],
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: motorista } = await supabase
        .from("motoristas")
        .select("id, nome, cnh_validade, veiculo_id, veiculo:veiculos(placa, modelo)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!motorista) return { motorista: null, viagens: [] as ViagemLite[], abast: [] as { litros: number; km_percorridos: number | null; data: string }[] };
      const [viag, abast] = await Promise.all([
        supabase
          .from("viagens")
          .select("id, status, origem_cidade, origem_uf, destino_cidade, destino_uf, data_saida, km_inicial, km_final, created_at")
          .eq("motorista_id", motorista.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("abastecimentos")
          .select("litros, km_percorridos, data")
          .eq("motorista_id", motorista.id)
          .gte("data", inicioMesStr),
      ]);
      return {
        motorista,
        viagens: (viag.data ?? []) as ViagemLite[],
        abast: (abast.data ?? []) as { litros: number; km_percorridos: number | null; data: string }[],
      };
    },
  });

  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!data?.motorista) {
    return (
      <div className="mx-auto max-w-md p-4">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-6 text-center space-y-2">
            <AlertCircle className="mx-auto size-8 text-destructive" />
            <div className="font-display text-lg font-semibold">Acesso indisponível</div>
            <p className="text-sm text-muted-foreground">
              Seu usuário ainda não está vinculado a um motorista. Entre em contato com o administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const emAndamento = data.viagens.find((v) => v.status === "em_andamento");
  const proxima = data.viagens.find((v) => v.status === "planejada");
  // Competência operacional: data da viagem (saída), com fallback para criação.
  const refV = (v: ViagemLite) => (v.data_saida ?? v.created_at ?? "").slice(0, 10);
  const concluidasMes = data.viagens.filter((v) => v.status === "concluida" && refV(v) >= inicioMesStr).length;
  const kmMesViagens = data.viagens
    .filter((v) => refV(v) >= inicioMesStr)
    .reduce((s, v) => s + Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0)), 0);

  const kmMesAbast = data.abast.reduce((s, a) => s + Number(a.km_percorridos ?? 0), 0);
  const kmMes = kmMesViagens > 0 ? kmMesViagens : kmMesAbast;
  const abastValidos = data.abast.filter((a) => Number(a.km_percorridos ?? 0) > 0 && Number(a.litros ?? 0) > 0);
  const totLitros = abastValidos.reduce((s, a) => s + Number(a.litros), 0);
  const totKm = abastValidos.reduce((s, a) => s + Number(a.km_percorridos ?? 0), 0);
  const consumo = totLitros > 0 && totKm > 0 ? (totKm / totLitros).toFixed(2) + " km/L" : "—";

  const cnhDias = data.motorista.cnh_validade
    ? Math.round((new Date(data.motorista.cnh_validade).getTime() - Date.now()) / 86400000)
    : null;

  const ativa = emAndamento ?? proxima;
  const veic = data.motorista.veiculo;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Painel do motorista</div>
        <h1 className="font-display text-2xl font-bold">{data.motorista.nome}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Olá, <span className="capitalize">{nome}</span>. Sua operação de hoje.
        </p>
        {veic && (
          <div className="mt-2 text-xs text-muted-foreground">
            Veículo vinculado: <span className="font-mono font-semibold text-foreground">{veic.placa}</span>
            {veic.modelo ? ` · ${veic.modelo}` : ""}
          </div>
        )}
      </div>

      {ativa ? (
        <Card className={emAndamento ? "border-brand/40 bg-brand-subtle" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.14em] text-brand">
                {emAndamento ? "Viagem em andamento" : "Próxima viagem"}
              </div>
              <Badge className={emAndamento ? "bg-brand text-brand-foreground" : ""} variant={emAndamento ? "default" : "outline"}>
                {emAndamento ? "Ativa" : "Planejada"}
              </Badge>
            </div>
            <div className="mt-2 font-display text-lg font-semibold">
              {ativa.origem_cidade ?? "—"}
              {ativa.origem_uf ? `/${ativa.origem_uf}` : ""} → {ativa.destino_cidade ?? "—"}
              {ativa.destino_uf ? `/${ativa.destino_uf}` : ""}
            </div>
            {emAndamento && ativa.data_saida && (
              <div className="mt-1 text-xs text-muted-foreground">
                Iniciada em {new Date(ativa.data_saida).toLocaleString("pt-BR")} · KM {ativa.km_inicial ?? "—"}
              </div>
            )}
            <div className="mt-3">
              <Link to="/app/viagens/$id" params={{ id: ativa.id }}>
                <Button size="sm" className="w-full">Abrir viagem</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Nenhuma viagem planejada ou em andamento no momento.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <MiniKpi label="Concluídas no mês" value={String(concluidasMes)} icon={CheckCircle2} />
        <MiniKpi label="Em andamento" value={emAndamento ? "1" : "0"} icon={Clock} />
        <MiniKpi label="KM no mês" value={kmMes.toLocaleString("pt-BR")} icon={MapPin} />
        <MiniKpi label="Consumo médio" value={consumo} icon={TrendingUp} />
      </div>

      {(cnhDias !== null && cnhDias < 60) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Alertas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-0">
            <AlertRow
              icon={AlertCircle}
              tone={cnhDias < 0 ? "danger" : "warn"}
              title={cnhDias < 0 ? "CNH vencida" : `CNH vence em ${cnhDias} dias`}
              description={data.motorista.cnh_validade ? new Date(data.motorista.cnh_validade).toLocaleDateString("pt-BR") : ""}
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 pb-4">
        <Link to="/app/avisos" className="block">
          <Button size="sm" className="w-full bg-brand hover:bg-brand/90">
            <MessageSquarePlus className="mr-1 size-4" /> Enviar aviso à operação
          </Button>
        </Link>
        <div className="flex gap-2">
          <Link to="/app/viagens" className="flex-1">
            <Button size="sm" variant="outline" className="w-full">Minhas viagens</Button>
          </Link>
          <Link to="/app/abastecimentos" className="flex-1">
            <Button size="sm" variant="outline" className="w-full">
              <Fuel className="mr-1 size-4" /> Abastecer
            </Button>
          </Link>
        </div>
      </div>
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
  const bg = tone === "warn" ? "bg-warning/15" : tone === "danger" ? "bg-destructive/15" : "bg-muted";
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
