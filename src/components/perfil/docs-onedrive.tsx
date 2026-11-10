import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudUpload, Download, FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { baixarDocMotorista, listarDocsMotorista, uploadDocMotorista } from "@/lib/onedrive.functions";
import { LinkPastaOneDrive } from "@/components/perfil/link-pasta-onedrive";

const fmt = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

async function toBase64(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  return btoa(bin);
}

/** Documentos do motorista guardados no OneDrive da empresa (pasta própria). */
export function DocsOneDrive({ motoristaId, compartilhar }: { motoristaId?: string; compartilhar?: boolean }) {
  const listar = useServerFn(listarDocsMotorista);
  const baixar = useServerFn(baixarDocMotorista);
  const [baixando, setBaixando] = useState<string | null>(null);

  const baixarDoc = async (id: string, nome: string) => {
    setBaixando(id);
    try {
      const r = await baixar({ data: { motoristaId, itemId: id } });
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const { salvarBlob } = await import("@/lib/baixar-arquivo");
      await salvarBlob(new Blob([bytes], { type: r.mime }), r.nome || nome);
    } catch (e) {
      toast.error("Falha ao baixar", { description: (e as Error).message });
    } finally {
      setBaixando(null);
    }
  };
  const upload = useServerFn(uploadDocMotorista);
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["onedrive-docs", motoristaId ?? "eu"],
    queryFn: () => listar({ data: { motoristaId } }),
    retry: false,
  });

  const enviar = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) {
        await upload({ data: { motoristaId, nome: f.name, mime: f.type, base64: await toBase64(f) } });
      }
    },
    onSuccess: () => {
      toast.success("Documento(s) enviados para o OneDrive");
      void qc.invalidateQueries({ queryKey: ["onedrive-docs"] });
    },
    onError: (e) => toast.error("Falha no envio", { description: (e as Error).message }),
    onSettled: () => setEnviando(false),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderOpen className="size-4 text-brand" /> Documentos (OneDrive)
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => void refetch()} disabled={isRefetching}>
          <RefreshCw className={`size-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        {data?.pasta && <p className="truncate text-[11px] text-muted-foreground">Pasta: {data.pasta}</p>}
        {compartilhar && motoristaId && <LinkPastaOneDrive motoristaId={motoristaId} compacto />}

        <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border p-3 text-sm">
          {enviando ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          {enviando ? "Enviando..." : "Adicionar documento"}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={enviando}
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!list.length) return;
              setEnviando(true);
              enviar.mutate(list);
            }}
          />
        </label>

        {isLoading ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="size-5 animate-spin text-brand" />
          </div>
        ) : error ? (
          <p className="text-xs text-destructive">{(error as Error).message}</p>
        ) : (data?.arquivos ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum documento na sua pasta ainda.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data!.arquivos.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{f.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmt(f.size)}
                    {f.updated ? ` · ${new Date(f.updated).toLocaleDateString("pt-BR")}` : ""}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Baixar ${f.name}`}
                  disabled={baixando === f.id}
                  onClick={() => void baixarDoc(f.id, f.name)}
                >
                  {baixando === f.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  <span className="ml-1 hidden sm:inline">Baixar</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
