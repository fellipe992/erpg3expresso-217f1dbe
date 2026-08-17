import { useState } from "react";
import { Camera, Loader2, X, FileText, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isNative } from "@/lib/native";

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

/** Lado maior máximo da imagem enviada. */
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Reduz a foto antes do upload. Fotos de 8–12 MP consomem muita memória no
 * WebView do Android e faziam o app fechar sozinho ao tirar a foto.
 */
async function comprimirImagem(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap =
      "createImageBitmap" in window
        ? await createImageBitmap(file)
        : await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
          });
    const w = "width" in bitmap ? bitmap.width : 0;
    const h = "height" in bitmap ? bitmap.height : 0;
    if (!w || !h) return file;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

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
  const aceitaImagem = accept.includes("image");
  const usarCameraNativa = isNative() && aceitaImagem;

  const enviar = async (list: File[]) => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uploaded: UploadedFile[] = [];
      for (const original of list) {
        const file = await comprimirImagem(original);
        const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const path = `${viagemId}/${categoria}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage
          .from("viagem-fotos")
          .upload(path, file, { contentType: file.type || "image/jpeg" });
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
      setFiles((prev) => {
        const next = multiple ? [...prev, ...uploaded] : uploaded;
        onChange?.(next);
        return next;
      });
      toast.success(`${uploaded.length} anexo(s) enviado(s)`);
    } catch (e) {
      toast.error("Erro no upload", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  /**
   * No APK, usa a câmera nativa (grava a foto em arquivo e devolve a URI).
   * Isso evita o input HTML de captura, que reabria o WebView e derrubava o
   * app em vários aparelhos Android.
   */
  const tirarFotoNativa = async () => {
    try {
      const { Camera: CapCamera, CameraResultType, CameraSource } = await import(
        "@capacitor/camera"
      );
      const perm = await CapCamera.checkPermissions();
      if (perm.camera !== "granted") {
        const req = await CapCamera.requestPermissions({ permissions: ["camera", "photos"] });
        if (req.camera !== "granted") {
          toast.error("Permissão de câmera negada");
          return;
        }
      }
      const photo = await CapCamera.getPhoto({
        quality: 70,
        width: MAX_SIDE,
        correctOrientation: true,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        promptLabelHeader: "Foto",
        promptLabelPhoto: "Galeria",
        promptLabelPicture: "Tirar foto",
        saveToGallery: false,
      });
      if (!photo.webPath) return;
      const res = await fetch(photo.webPath);
      const blob = await res.blob();
      const ext = photo.format || "jpeg";
      const file = new File([blob], `foto-${Date.now()}.${ext}`, {
        type: blob.type || `image/${ext}`,
      });
      await enviar([file]);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/cancel/i.test(msg)) return;
      toast.error("Não foi possível usar a câmera", { description: msg });
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
      {usarCameraNativa ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => void tirarFotoNativa()}
          disabled={uploading}
        >
          <ImagePlus className="mr-2 size-4" /> Tirar foto ou escolher da galeria
        </Button>
      ) : (
        <Input
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => {
            const list = e.target.files;
            if (!list || list.length === 0) return;
            const arr = Array.from(list);
            e.target.value = "";
            void enviar(arr);
          }}
          disabled={uploading}
        />
      )}
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
