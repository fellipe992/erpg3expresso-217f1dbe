import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ShieldCheck, Loader2, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/auditoria")({
  head: () => ({ meta: [{ title: "Auditoria — G3 Expresso" }] }),
  component: AuditoriaPage,
});

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function AuditoriaPage() {
  const { role } = useAuth();
  const isAdmin = role === "administrador";
  const isGestor = role === "gestor";

  if (!isAdmin && !isGestor) return <Navigate to="/app" replace />;

  const [tab, setTab] = useState(isAdmin ? "viagens" : "viagens");
  const [inicio, setInicio] = useState(daysAgo(30));
  const [fim, setFim] = useState(new Date().toISOString().slice(0, 10));
  const [busca, setBusca] = useState("");

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
          <ShieldCheck className="size-5 text-brand" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Histórico completo de ações executadas no sistema.
          </p>
        </div>
      </header>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[160px_160px_1fr]">
          <div className="space-y-1.5">
            <Label className="text-xs">Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Evento, usuário, código, descrição…"
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="viagens">Viagens</TabsTrigger>
          {isAdmin && <TabsTrigger value="plano">Plano de contas</TabsTrigger>}
          {isAdmin && <TabsTrigger value="usuarios">Usuários</TabsTrigger>}
        </TabsList>

        <TabsContent value="viagens" className="mt-4">
          <AuditoriaViagens inicio={inicio} fim={fim} busca={busca} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="plano" className="mt-4">
            <AuditoriaPlano inicio={inicio} fim={fim} busca={busca} />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="usuarios" className="mt-4">
            <AuditoriaUsuarios inicio={inicio} fim={fim} busca={busca} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function endOfDay(d: string) {
  return `${d}T23:59:59`;
}

function AuditoriaViagens({ inicio, fim, busca }: { inicio: string; fim: string; busca: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["auditoria-viagens", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagem_auditoria")
        .select("id, evento, detalhes, usuario_id, created_at, viagem:viagens(codigo, motorista:motoristas(nome), veiculo:veiculos(placa))")
        .gte("created_at", inicio)
        .lte("created_at", endOfDay(fim))
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((r) => {
      const v = r.viagem as { codigo?: string; motorista?: { nome?: string }; veiculo?: { placa?: string } } | null;
      return (
        (r.evento ?? "").toLowerCase().includes(q) ||
        (v?.codigo ?? "").toLowerCase().includes(q) ||
        (v?.motorista?.nome ?? "").toLowerCase().includes(q) ||
        (v?.veiculo?.placa ?? "").toLowerCase().includes(q) ||
        JSON.stringify(r.detalhes ?? {}).toLowerCase().includes(q)
      );
    });
  }, [data, busca]);

  return <AuditTable loading={isLoading} rows={rows.map((r) => {
    const v = r.viagem as { codigo?: string; motorista?: { nome?: string }; veiculo?: { placa?: string } } | null;
    return {
      id: r.id,
      when: r.created_at,
      badge: eventBadge(r.evento),
      title: `OS ${v?.codigo ?? "—"} · ${eventoLabel(r.evento)}`,
      subtitle: [v?.motorista?.nome, v?.veiculo?.placa].filter(Boolean).join(" · ") || "—",
      details: r.detalhes,
    };
  })} />;
}

function AuditoriaPlano({ inicio, fim, busca }: { inicio: string; fim: string; busca: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["auditoria-plano", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plano_auditoria")
        .select("*")
        .gte("created_at", inicio)
        .lte("created_at", endOfDay(fim))
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtered = (data ?? []).filter((r) => {
      if (!q) return true;
      return (
        (r.entidade ?? "").toLowerCase().includes(q) ||
        (r.acao ?? "").toLowerCase().includes(q) ||
        (r.descricao ?? "").toLowerCase().includes(q)
      );
    });
    return filtered.map((r) => ({
      id: r.id,
      when: r.created_at,
      badge: planoBadge(r.acao),
      title: r.descricao ?? `${r.acao} ${r.entidade}`,
      subtitle: `${r.entidade} · ${r.acao}`,
      details: { antes: r.dados_antes, depois: r.dados_depois },
    }));
  }, [data, busca]);

  return <AuditTable loading={isLoading} rows={rows} />;
}

function AuditoriaUsuarios({ inicio, fim, busca }: { inicio: string; fim: string; busca: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["auditoria-usuarios", inicio, fim],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios_auditoria")
        .select("*")
        .gte("created_at", inicio)
        .lte("created_at", endOfDay(fim))
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtered = (data ?? []).filter((r) => {
      if (!q) return true;
      return (
        (r.acao ?? "").toLowerCase().includes(q) ||
        (r.actor_email ?? "").toLowerCase().includes(q) ||
        JSON.stringify(r.detalhes ?? {}).toLowerCase().includes(q)
      );
    });
    return filtered.map((r) => ({
      id: r.id,
      when: r.created_at,
      badge: <Badge variant="outline">{r.acao}</Badge>,
      title: r.acao,
      subtitle: `Por ${r.actor_email ?? "sistema"} · alvo ${String(r.target_user_id).slice(0, 8)}`,
      details: r.detalhes,
    }));
  }, [data, busca]);

  return <AuditTable loading={isLoading} rows={rows} />;
}

type Row = {
  id: string;
  when: string;
  badge: React.ReactNode;
  title: string;
  subtitle: string;
  details: unknown;
};

function AuditTable({ loading, rows }: { loading: boolean; rows: Row[] }) {
  if (loading) {
    return (
      <div className="grid min-h-[30vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum evento no período selecionado.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{rows.length} eventos</CardTitle>
        <CardDescription>Clique numa linha para ver os detalhes técnicos.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Quando</TableHead>
              <TableHead className="w-[140px]">Tipo</TableHead>
              <TableHead>Descrição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <Collapsible key={r.id} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer">
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(r.when), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>{r.badge}</TableCell>
                      <TableCell>
                        <div className="text-sm">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={3}>
                        <pre className="max-h-72 overflow-auto rounded bg-background p-3 text-[11px] leading-snug">
                          {JSON.stringify(r.details ?? {}, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function eventoLabel(ev: string) {
  const map: Record<string, string> = {
    criada: "Viagem criada",
    iniciada: "Viagem iniciada",
    finalizada: "Viagem finalizada",
    cancelada: "Viagem cancelada",
    checklist_saida: "Checklist de saída",
    checklist_chegada: "Checklist de chegada",
    ocorrencia: "Ocorrência registrada",
  };
  return map[ev] ?? ev;
}

function eventBadge(ev: string) {
  const tone =
    ev === "criada" ? "outline" :
    ev === "iniciada" ? "default" :
    ev === "finalizada" ? "secondary" :
    ev === "cancelada" ? "destructive" : "outline";
  return <Badge variant={tone as "outline" | "default" | "secondary" | "destructive"}>{eventoLabel(ev)}</Badge>;
}

function planoBadge(acao: string) {
  const tone =
    acao === "criar" ? "default" :
    acao === "atualizar" ? "secondary" :
    acao === "inativar" ? "destructive" :
    acao === "reativar" ? "outline" : "outline";
  return <Badge variant={tone as "outline" | "default" | "secondary" | "destructive"}>{acao}</Badge>;
}
