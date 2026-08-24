import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Trash2, Download, HardDrive, Search, Image as ImageIcon, FileType } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/app/documentos")({
  head: () => ({ meta: [{ title: "Documentos — G3 Expresso" }] }),
  component: DocumentosPage,
});

const BUCKETS = ["viagem-fotos", "abastecimento-comprovantes", "manutencao-notas", "company-assets"] as const;
type BucketName = (typeof BUCKETS)[number];

type StorageObj = {
  bucket: BucketName;
  path: string;
  size: number;
  updated_at?: string;
  mime?: string | null;
};

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

// Quota estimada do plano (referência). Ajuste se necessário.
const QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB

async function listBucketRecursive(bucket: BucketName, prefix = "", acc: StorageObj[] = []): Promise<StorageObj[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error || !data) return acc;
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    // Pastas retornam id === null e metadata === null
    if (item.id === null || item.metadata === null) {
      await listBucketRecursive(bucket, path, acc);
    } else {
      acc.push({
        bucket,
        path,
        size: Number(item.metadata?.size ?? 0),
        updated_at: item.updated_at ?? item.created_at ?? undefined,
        mime: (item.metadata?.mimetype as string) ?? null,
      });
    }
  }
  return acc;
}

function DocumentosPage() {
  const { role } = useAuth();
  const isStaff = role === "administrador" || role === "financeiro" || role === "gestor";
  const canDelete = role === "administrador" || role === "financeiro";
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [bucketFiltro, setBucketFiltro] = useState<BucketName | "todos">("todos");
  const [confirmar, setConfirmar] = useState<StorageObj | null>(null);

  const { data: objetos = [], isLoading } = useQuery({
    queryKey: ["storage-inventory"],
    enabled: isStaff,
    queryFn: async () => {
      const all: StorageObj[] = [];
      for (const b of BUCKETS) {
        try {
          const items = await listBucketRecursive(b);
          all.push(...items);
        } catch (e) {
          console.warn("Falha ao listar bucket", b, e);
        }
      }
      return all;
    },
  });

  const totalPorBucket = useMemo(() => {
    const map = new Map<BucketName, { count: number; size: number }>();
    for (const b of BUCKETS) map.set(b, { count: 0, size: 0 });
    for (const o of objetos) {
      const cur = map.get(o.bucket)!;
      cur.count++;
      cur.size += o.size;
    }
    return map;
  }, [objetos]);

  const totalSize = useMemo(() => objetos.reduce((s, o) => s + o.size, 0), [objetos]);
  const percentUso = Math.min(100, (totalSize / QUOTA_BYTES) * 100);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return objetos
      .filter((o) => (bucketFiltro === "todos" ? true : o.bucket === bucketFiltro))
      .filter((o) => (q ? o.path.toLowerCase().includes(q) : true))
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  }, [objetos, busca, bucketFiltro]);

  const removerMut = useMutation({
    mutationFn: async (obj: StorageObj) => {
      const { error } = await supabase.storage.from(obj.bucket).remove([obj.path]);
      if (error) throw error;
      // Limpa registro em viagem_anexos se existir
      if (obj.bucket === "viagem-fotos") {
        await supabase.from("viagem_anexos").delete().eq("storage_path", obj.path);
      }
    },
    onSuccess: () => {
      toast.success("Arquivo removido");
      qc.invalidateQueries({ queryKey: ["storage-inventory"] });
      qc.invalidateQueries({ queryKey: ["viagem-anexos"] });
    },
    onError: (e: Error) => toast.error("Erro ao remover", { description: e.message }),
  });

  const abrir = async (obj: StorageObj) => {
    const { data, error } = await supabase.storage.from(obj.bucket).createSignedUrl(obj.path, 3600);
    if (error || !data) {
      toast.error("Não foi possível gerar link");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-3xl p-8 text-center text-sm text-muted-foreground">
        Você não tem acesso a esta área.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
            <FileText className="size-5 text-brand" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Documentos</h1>
            <p className="text-sm text-muted-foreground">
              Anexos operacionais, comprovantes e uso de armazenamento.
            </p>
          </div>
        </div>
        {isStaff && <SincronizarOneDrive />}
      </div>



      {/* Uso de armazenamento */}
      <Card className="p-4 md:p-6">
        <div className="mb-4 flex items-center gap-2">
          <HardDrive className="size-4 text-brand" />
          <h2 className="font-display font-bold">Uso de armazenamento</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculando espaço utilizado...
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-display text-2xl font-bold">{fmtBytes(totalSize)}</div>
                <div className="text-xs text-muted-foreground">
                  de {fmtBytes(QUOTA_BYTES)} disponíveis · {objetos.length.toLocaleString("pt-BR")} arquivos
                </div>
              </div>
              <Badge variant="outline" className="text-xs">{percentUso.toFixed(1)}% utilizado</Badge>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${percentUso > 80 ? "bg-destructive" : "bg-brand"}`}
                style={{ width: `${percentUso}%` }}
              />
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-4">
              {BUCKETS.map((b) => {
                const t = totalPorBucket.get(b)!;
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBucketFiltro(bucketFiltro === b ? "todos" : b)}
                    className={`rounded-md border p-3 text-left transition-colors hover:bg-muted/40 ${
                      bucketFiltro === b ? "border-brand bg-brand-subtle" : "border-border/60"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {bucketLabel(b)}
                    </div>
                    <div className="mt-1 font-display font-bold">{fmtBytes(t.size)}</div>
                    <div className="text-xs text-muted-foreground">{t.count} arquivos</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Filtros */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome do arquivo ou pasta..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={bucketFiltro === "todos" ? "default" : "outline"}
            onClick={() => setBucketFiltro("todos")}
          >
            Todos
          </Button>
          {BUCKETS.map((b) => (
            <Button
              key={b}
              size="sm"
              variant={bucketFiltro === b ? "default" : "outline"}
              onClick={() => setBucketFiltro(b)}
            >
              {bucketLabel(b)}
            </Button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <Card>
        {isLoading ? (
          <div className="grid min-h-[30vh] place-items-center">
            <Loader2 className="size-6 animate-spin text-brand" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum arquivo encontrado.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtrados.map((o) => (
              <li key={`${o.bucket}/${o.path}`} className="flex items-center gap-3 p-3 md:p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-md bg-muted/40 text-muted-foreground">
                  {o.mime?.startsWith("image/") ? <ImageIcon className="size-4" /> : <FileType className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{o.path.split("/").pop()}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="h-4 px-1 text-[9px]">{bucketLabel(o.bucket)}</Badge>
                    <span className="truncate">{o.path}</span>
                    <span>·</span>
                    <span>{fmtBytes(o.size)}</span>
                    {o.updated_at && (
                      <>
                        <span>·</span>
                        <span>{new Date(o.updated_at).toLocaleDateString("pt-BR")}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => abrir(o)} title="Abrir">
                    <Download className="size-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmar(o)}
                      title="Excluir"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e libera o espaço utilizado por este arquivo. Não é possível desfazer.
              {confirmar && (
                <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs">
                  <div className="font-mono">{confirmar.path}</div>
                  <div className="text-muted-foreground">{fmtBytes(confirmar.size)}</div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmar) removerMut.mutate(confirmar);
                setConfirmar(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function bucketLabel(b: BucketName) {
  switch (b) {
    case "viagem-fotos":
      return "Viagens";
    case "abastecimento-comprovantes":
      return "Abastecimentos";
    case "manutencao-notas":
      return "Manutenções";
    case "company-assets":
      return "Empresa";
  }
}
