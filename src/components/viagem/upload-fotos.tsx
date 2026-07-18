import { useState } from "react";
import { Camera, Loader2, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type UploadedFile = {
  path: string;
  mime: string;
  name: string;
};

type Props = {
  viagemId: string;
  categoria: "checklist_saida" | "checklist_chegada" | "ocorrencia" | "canhoto" | "entrega" | "veiculo" | "outro";
  ocorrenciaId?: string;
  label?: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;
  onChange?: (files: UploadedFile[]) => void;
  persist?: boolean; // se true, grava direto em viagem_anexos
};

export function UploadFotos({
  viagemId,
  categoria,
  ocorrenciaId,
  label = "Anexar foto",
  accept = "image/*",
  multiple = true,
  required = false,
  onChange,
  persist = true,
}: Props) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (list: FileList) => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uploaded: UploadedFile[] = [];
      for (const file of Array.from(list)) {
        const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${viagemId}/${categoria}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from("viagem-fotos").upload(path, file);
        if (error) throw error;
        const u: UploadedFile = { path, mime: file.type, name: file.name };
        uploaded.push(u);
        if (persist) {
          await supabase.from("viagem_anexos").insert({
            viagem_id: viagemId,
            ocorrencia_id: ocorrenciaId ?? null,
            categoria,
            storage_path: path,
            mime_type: file.type,
            created_by: userData.user?.id,
          });
        }
      }
      const next = multiple ? [...files, ...uploaded] : uploaded;
      setFiles(next);
      onChange?.(next);
      toast.success(`${uploaded.length} anexo(s) enviado(s)`);
    } catch (e) {
      toast.error("Erro no upload", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  const remove = (path: string) => {
    const next = files.filter((f) => f.path !== path);
    setFiles(next);
    onChange?.(next);
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1 text-xs">
        <Camera className="size-3.5" /> {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        type="file"
        accept={accept}
        multiple={multiple}
        capture={accept.includes("image") ? "environment" : undefined}
        onChange={(e) => e.target.files && e.target.files.length > 0 && handleUpload(e.target.files)}
        disabled={uploading}
      />
      {uploading && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Enviando...
        </p>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <div key={f.path} className="flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1 text-xs">
              {f.mime.startsWith("image/") ? <Camera className="size-3" /> : <FileText className="size-3" />}
              <span className="max-w-[120px] truncate">{f.name}</span>
              <Button variant="ghost" size="icon" className="size-4" onClick={() => remove(f.path)}>
                <X className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
