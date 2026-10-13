import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NIVEIS, TIPOS_RISCO, useZonasRisco, type ZonaRisco } from "@/lib/zonas-risco";

export const Route = createFileRoute("/_authenticated/app/zonas-risco")({
  head: () => ({
    meta: [
      { title: "Zonas de risco — G3 Expresso" },
      { name: "description", content: "Valide zonas de risco reportadas pelos motoristas e ajuste o mapa." },
      { property: "og:title", content: "Zonas de risco — G3 Expresso" },
      { property: "og:description", content: "Mapa de risco de roubo, assalto e acidentes da operação G3." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ZonasRiscoPage,
});

type Reporte = {
  id: string;
  user_id: string;
  lat: number | null;
  lng: number | null;
  bairro: string | null;
  tipo: string;
  nivel_sugerido: number;
  comentario: string | null;
  status: string;
  created_at: string;
};

function NivelPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {[1, 2, 3, 4].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${value === n ? "border-foreground font-semibold" : "border-border/60"}`}
        >
          <span className="size-2.5 rounded-full" style={{ background: NIVEIS[n].cor }} />
          {NIVEIS[n].label}
        </button>
      ))}
    </div>
  );
}

function ReporteCard({ r, nome }: { r: Reporte; nome?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [nivel, setNivel] = useState(r.nivel_sugerido);
  const [raio, setRaio] = useState("2000");
  const [nomeZona, setNomeZona] = useState(r.bairro ?? "");

  const decidir = useMutation({
    mutationFn: async (aprovar: boolean) => {
      let zonaId: string | null = null;
      if (aprovar) {
        if (r.lat == null || r.lng == null) throw new Error("Reporte sem posição GPS: não dá para marcar no mapa.");
        const { data, error } = await supabase
          .from("zonas_risco")
          .insert({
            nome: (nomeZona.trim() || "ZONA REPORTADA").toUpperCase(),
            tipo: r.tipo,
            nivel,
            lat: r.lat,
            lng: r.lng,
            raio_m: Math.max(300, Math.min(50000, Number(raio) || 2000)),
            recomendacao: r.comentario,
            origem: "motorista",
            validado_por: user?.id,
            validado_em: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (error) throw error;
        zonaId = data.id;
      }
      const { error } = await supabase
        .from("zonas_risco_reportes")
        .update({
          status: aprovar ? "aprovado" : "recusado",
          zona_id: zonaId,
          revisado_por: user?.id,
          revisado_em: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: (_, aprovar) => {
      toast.success(aprovar ? "Zona adicionada ao mapa" : "Reporte recusado");
      qc.invalidateQueries({ queryKey: ["zonas-risco"] });
      qc.invalidateQueries({ queryKey: ["zonas-reportes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{TIPOS_RISCO[r.tipo] ?? r.tipo}</Badge>
        <span className="text-xs text-muted-foreground">
          {nome ?? "Motorista"} · {new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </span>
        {r.lat != null && r.lng != null && (
          <a
            className="ml-auto inline-flex items-center gap-1 text-xs text-brand"
            href={`https://www.google.com/maps?q=${r.lat},${r.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver local <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {r.comentario && <p>{r.comentario}</p>}
      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
        <Input value={nomeZona} onChange={(e) => setNomeZona(e.target.value.toUpperCase())} placeholder="NOME DA ZONA" />
        <Input value={raio} onChange={(e) => setRaio(e.target.value.replace(/\D/g, ""))} placeholder="Raio (m)" />
      </div>
      <NivelPicker value={nivel} onChange={setNivel} />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => decidir.mutate(true)} disabled={decidir.isPending}>
          <Check className="mr-1 size-4" /> Aprovar
        </Button>
        <Button size="sm" variant="outline" onClick={() => decidir.mutate(false)} disabled={decidir.isPending}>
          <X className="mr-1 size-4" /> Recusar
        </Button>
      </div>
    </Card>
  );
}

function ZonaLinha({ z }: { z: ZonaRisco }) {
  const qc = useQueryClient();
  const salvar = useMutation({
    mutationFn: async (patch: { nivel?: number; ativo?: boolean }) => {
      const { error } = await supabase.from("zonas_risco").update(patch).eq("id", z.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zonas-risco"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="size-3 rounded-full" style={{ background: NIVEIS[z.nivel].cor }} />
      <span className="min-w-0 flex-1 font-medium">{z.nome}</span>
      <span className="text-xs text-muted-foreground">{z.uf} · {TIPOS_RISCO[z.tipo] ?? z.tipo}{z.origem === "motorista" ? " · reportada" : ""}</span>
      <NivelPicker value={z.nivel} onChange={(n) => salvar.mutate({ nivel: n })} />
      <Button size="sm" variant="ghost" onClick={() => salvar.mutate({ ativo: false })}>Desativar</Button>
    </div>
  );
}

function ZonasRiscoPage() {
  const { role } = useAuth();
  const allowed = role === "administrador" || role === "gestor" || role === "monitor";
  const { data: zonas = [] } = useZonasRisco();
  const [busca, setBusca] = useState("");

  const { data: reportes = [] } = useQuery({
    queryKey: ["zonas-reportes"],
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zonas_risco_reportes")
        .select("*")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Reporte[];
    },
  });

  const ids = [...new Set(reportes.map((r) => r.user_id))];
  const { data: nomes = {} } = useQuery({
    queryKey: ["zonas-reportes-nomes", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,nome").in("id", ids);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.nome])) as Record<string, string>;
    },
  });

  if (!allowed) return <p className="p-6 text-sm text-muted-foreground">Acesso restrito à operação.</p>;

  const filtradas = zonas
    .filter((z) => `${z.nome} ${z.uf}`.toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => b.nivel - a.nivel);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Zonas de risco</h1>
        <p className="text-sm text-muted-foreground">
          Valide os reportes dos motoristas e ajuste o nível das zonas. Aprovadas entram no mapa na hora.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Reportes pendentes ({reportes.length})</h2>
        {reportes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum reporte aguardando validação.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {reportes.map((r) => (
            <ReporteCard key={r.id} r={r} nome={nomes[r.user_id]} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Zonas ativas ({zonas.length})</h2>
          <Input className="ml-auto max-w-xs" placeholder="Buscar zona ou UF" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Card className="divide-y divide-border/60 px-3">
          {filtradas.map((z) => (
            <ZonaLinha key={z.id} z={z} />
          ))}
        </Card>
        <p className="text-xs text-muted-foreground">
          A base inicial é uma estimativa a partir de informações públicas de roubo de carga e acidentes; ajuste conforme a experiência da operação.
        </p>
      </section>
    </div>
  );
}
