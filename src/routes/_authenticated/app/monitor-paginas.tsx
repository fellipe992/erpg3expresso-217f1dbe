import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Globe, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { verificarPaginaMonitorada } from "@/lib/monitor-paginas.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/monitor-paginas")({
  head: () => ({
    meta: [
      { title: "Monitor de páginas — G3 Expresso" },
      { name: "description", content: "Acompanhe mudanças em páginas de concorrentes e órgãos reguladores." },
    ],
  }),
  component: MonitorPaginasPage,
});

const UM_DIA_MS = 24 * 60 * 60 * 1000;

function MonitorPaginasPage() {
  const qc = useQueryClient();
  const verificarFn = useServerFn(verificarPaginaMonitorada);
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [categoria, setCategoria] = useState<"regulador" | "concorrente">("regulador");
  const [verificandoId, setVerificandoId] = useState<string | null>(null);
  const [verificandoTodas, setVerificandoTodas] = useState(false);
  const autoVerificou = useRef(false);

  const { data: paginas = [], isLoading } = useQuery({
    queryKey: ["paginas-monitoradas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("paginas_monitoradas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const adicionar = useMutation({
    mutationFn: async () => {
      const u = url.trim();
      if (!nome.trim() || !u) throw new Error("Informe o nome e a URL da página");
      const urlFinal = /^https?:\/\//i.test(u) ? u : `https://${u}`;
      const { error } = await supabase.from("paginas_monitoradas").insert({
        nome: nome.trim().toUpperCase(),
        url: urlFinal,
        categoria,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNome("");
      setUrl("");
      toast.success("Página adicionada ao monitoramento");
      qc.invalidateQueries({ queryKey: ["paginas-monitoradas"] });
    },
    onError: (e: Error) => toast.error("Erro ao adicionar", { description: e.message }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("paginas_monitoradas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Página removida");
      qc.invalidateQueries({ queryKey: ["paginas-monitoradas"] });
    },
    onError: (e: Error) => toast.error("Erro ao remover", { description: e.message }),
  });

  async function verificarUma(id: string) {
    setVerificandoId(id);
    try {
      const r = await verificarFn({ data: { id } });
      if (r.primeiraCaptura) toast.info("Primeira captura salva como referência");
      else if (r.mudou) toast.success("Alterações detectadas desde a última verificação");
      else toast.info("Sem alterações desde a última verificação");
      qc.invalidateQueries({ queryKey: ["paginas-monitoradas"] });
    } catch (e) {
      toast.error("Erro ao verificar página", { description: (e as Error).message });
      qc.invalidateQueries({ queryKey: ["paginas-monitoradas"] });
    } finally {
      setVerificandoId(null);
    }
  }

  async function verificarLista(ids: string[]) {
    if (ids.length === 0) return;
    setVerificandoTodas(true);
    let mudancas = 0;
    for (const id of ids) {
      try {
        const r = await verificarFn({ data: { id } });
        if (r.mudou) mudancas++;
      } catch {
        /* erro já registrado na linha */
      }
    }
    qc.invalidateQueries({ queryKey: ["paginas-monitoradas"] });
    setVerificandoTodas(false);
    toast.info(mudancas > 0 ? `${mudancas} página(s) com alterações.` : "Verificação concluída sem alterações.");
  }

  useEffect(() => {
    if (autoVerificou.current || paginas.length === 0) return;
    const agora = Date.now();
    const desatualizadas = paginas
      .filter((p) => !p.ultima_verificacao_em || agora - new Date(p.ultima_verificacao_em).getTime() > UM_DIA_MS)
      .map((p) => p.id);
    if (desatualizadas.length > 0) {
      autoVerificou.current = true;
      void verificarLista(desatualizadas);
    }
  }, [paginas]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Globe className="size-6 text-brand" /> Monitor de páginas
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe sites de concorrentes e órgãos reguladores (como a ANTT) e veja apenas o que mudou desde a última verificação.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => verificarLista(paginas.map((p) => p.id))}
          disabled={verificandoTodas || paginas.length === 0}
        >
          {verificandoTodas ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          Verificar todas agora
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar página para monitorar</CardTitle>
          <CardDescription>Páginas não verificadas há mais de 24 horas são checadas automaticamente ao abrir esta tela.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr_160px_auto] sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: ANTT Piso Mínimo" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.gov.br/antt/..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as "regulador" | "concorrente")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regulador">Órgão regulador</SelectItem>
                  <SelectItem value="concorrente">Concorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => adicionar.mutate()} disabled={adicionar.isPending}>
              <Plus className="mr-1.5 size-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : paginas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma página cadastrada ainda. Adicione URLs de concorrentes ou órgãos reguladores acima.
        </Card>
      ) : (
        <div className="space-y-3">
          {paginas.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.nome}</span>
                      <Badge variant="outline">{p.categoria === "regulador" ? "Órgão regulador" : "Concorrente"}</Badge>
                      {p.teve_alteracao && <Badge className="bg-primary text-primary-foreground">Mudou</Badge>}
                      {p.ultimo_erro && <Badge variant="destructive">Erro</Badge>}
                    </div>
                    <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                      {p.url} <ExternalLink className="size-3" />
                    </a>
                    <p className="text-xs text-muted-foreground">
                      Última verificação: {p.ultima_verificacao_em ? new Date(p.ultima_verificacao_em).toLocaleString("pt-BR") : "Nunca verificada"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => verificarUma(p.id)} disabled={verificandoId === p.id || verificandoTodas}>
                      {verificandoId === p.id ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
                      Verificar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remover.mutate(p.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {p.ultimo_erro && <p className="rounded bg-destructive/10 p-2 text-xs text-destructive">{p.ultimo_erro}</p>}

                {p.teve_alteracao && p.ultimo_diff ? (
                  <div className="max-h-64 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs">
                    {p.ultimo_diff.split("\n").map((linha, i) => (
                      <div key={i} className={linha.startsWith("+") ? "text-primary" : "text-destructive"}>
                        {linha}
                      </div>
                    ))}
                  </div>
                ) : p.ultima_verificacao_em && !p.ultimo_erro ? (
                  <p className="text-xs text-muted-foreground">Nenhuma alteração detectada desde a última verificação.</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}