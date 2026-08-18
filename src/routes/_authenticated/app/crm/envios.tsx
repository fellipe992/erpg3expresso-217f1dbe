import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MailCheck, MailWarning, MailPlus, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCrmLeads } from "@/hooks/use-crm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/crm/envios")({
  head: () => ({
    meta: [
      { title: "Envios de e-mail por dia — G3 Expresso" },
      {
        name: "description",
        content:
          "Painel diário dos e-mails de apresentação enviados pelo Hunter, com totais enviados, falhas e leads ainda pendentes de contato.",
      },
      { property: "og:title", content: "Envios de e-mail por dia — G3 Expresso" },
      {
        property: "og:description",
        content: "Acompanhe quantos e-mails de prospecção saíram por dia e quantos leads seguem pendentes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EnviosPorDiaPage,
});

type Envio = {
  id: string;
  destinatario: string;
  empresa: string | null;
  contato_nome: string | null;
  status: string;
  detalhe: string | null;
  created_at: string;
};

/** Data local (America/Sao_Paulo) no formato YYYY-MM-DD para agrupar por dia. */
function diaLocal(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

function rotuloDia(dia: string) {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  if (dia === hoje) return "Hoje";
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

function EnviosPorDiaPage() {
  const [janela, setJanela] = useState("30");

  const { data: leads = [], isPending: carregandoLeads } = useCrmLeads();

  const envios = useQuery({
    queryKey: ["crm-envios-por-dia", janela],
    queryFn: async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - Number(janela));
      const { data, error } = await supabase
        .from("crm_emails_enviados")
        .select("id, destinatario, empresa, contato_nome, status, detalhe, created_at")
        .gte("created_at", desde.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Envio[];
    },
  });

  const lista = envios.data ?? [];

  const dias = useMemo(() => {
    const mapa = new Map<string, { dia: string; enviados: Envio[]; falhas: Envio[] }>();
    for (const e of lista) {
      const dia = diaLocal(e.created_at);
      const atual = mapa.get(dia) ?? { dia, enviados: [], falhas: [] };
      if (e.status === "enviado") atual.enviados.push(e);
      else atual.falhas.push(e);
      mapa.set(dia, atual);
    }
    return [...mapa.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1));
  }, [lista]);

  const enviadosSet = useMemo(
    () => new Set(lista.filter((e) => e.status === "enviado").map((e) => e.destinatario.toLowerCase())),
    [lista],
  );

  const pendentes = useMemo(
    () => leads.filter((l) => l.email && !enviadosSet.has(l.email.toLowerCase())),
    [leads, enviadosSet],
  );

  const hoje = dias[0]?.dia === diaLocal(new Date().toISOString()) ? dias[0] : null;
  const totalEnviados = lista.filter((e) => e.status === "enviado").length;
  const totalFalhas = lista.length - totalEnviados;
  const media = dias.length > 0 ? Math.round((totalEnviados / dias.length) * 10) / 10 : 0;
  const maximo = Math.max(1, ...dias.map((d) => d.enviados.length + d.falhas.length));

  const carregando = envios.isPending || carregandoLeads;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
          <CalendarDays className="size-5 text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold">Envios de e-mail por dia</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a prospecção ativa: quantos e-mails de apresentação saíram em cada dia e quantos leads ainda
            estão pendentes de primeiro contato.
          </p>
        </div>
        <Select value={janela} onValueChange={setJanela}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={<Send className="size-4 text-brand" />}
          titulo="Enviados hoje"
          valor={hoje?.enviados.length ?? 0}
          detalhe={hoje && hoje.falhas.length > 0 ? `${hoje.falhas.length} falha(s)` : "sem falhas hoje"}
          carregando={carregando}
        />
        <Kpi
          icon={<MailCheck className="size-4 text-brand" />}
          titulo="Total enviados no período"
          valor={totalEnviados}
          detalhe={`média de ${media} por dia com envio`}
          carregando={carregando}
        />
        <Kpi
          icon={<MailPlus className="size-4 text-brand" />}
          titulo="Leads pendentes"
          valor={pendentes.length}
          detalhe="com e-mail e sem apresentação"
          carregando={carregando}
        />
        <Kpi
          icon={<MailWarning className="size-4 text-destructive" />}
          titulo="Falhas no período"
          valor={totalFalhas}
          detalhe={totalFalhas > 0 ? "revise os destinatários" : "nenhuma falha registrada"}
          carregando={carregando}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico diário</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {carregando && <Skeleton className="h-40 w-full" />}

          {!carregando && dias.length === 0 && (
            <p className="py-6 text-sm text-muted-foreground">
              Nenhum e-mail de apresentação enviado neste período.
            </p>
          )}

          {!carregando &&
            dias.map((d) => {
              const total = d.enviados.length + d.falhas.length;
              return (
                <div key={d.dia} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-24 text-sm font-medium">{rotuloDia(d.dia)}</span>
                    <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${(total / maximo) * 100}%` }}
                      />
                    </div>
                    <Badge variant="outline">{d.enviados.length} enviado(s)</Badge>
                    {d.falhas.length > 0 && <Badge variant="destructive">{d.falhas.length} falha(s)</Badge>}
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {[...d.enviados, ...d.falhas].slice(0, 6).map((e) => (
                      <div key={e.id} className="truncate">
                        {e.status === "enviado" ? "✓" : "✕"} {e.empresa ?? "—"} · {e.destinatario}
                        {e.status !== "enviado" && e.detalhe ? ` · ${e.detalhe}` : ""}
                      </div>
                    ))}
                    {total > 6 && <div>e mais {total - 6} envio(s) neste dia.</div>}
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  titulo,
  valor,
  detalhe,
  carregando,
}: {
  icon: React.ReactNode;
  titulo: string;
  valor: number;
  detalhe: string;
  carregando: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {titulo}
        </div>
        {carregando ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="font-display text-2xl font-bold">{valor}</div>
        )}
        <p className="text-xs text-muted-foreground">{detalhe}</p>
      </CardContent>
    </Card>
  );
}
