import { useEffect, useState } from "react";
import { Camera, Loader2, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { isNative } from "@/lib/native";

const MAX_SIDE = 800;

async function comprimir(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.8));
    if (!blob) return file;
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function AvatarUpload({
  userId,
  nome,
  avatarPath,
  onChange,
}: {
  userId: string;
  nome: string;
  avatarPath: string | null;
  onChange?: (path: string) => void;
}) {
  const [path, setPath] = useState(avatarPath);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPath(avatarPath);
  }, [avatarPath]);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    if (path.startsWith("http")) {
      setUrl(path);
      return;
    }
    void supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);

  const enviar = async (original: File) => {
    setBusy(true);
    try {
      const file = await comprimir(original);
      const novo = `${userId}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(novo, file, { contentType: file.type || "image/jpeg", upsert: true });
      if (error) throw error;
      const { error: upErr } = await supabase.from("profiles").update({ avatar_url: novo }).eq("id", userId);
      if (upErr) throw upErr;
      setPath(novo);
      onChange?.(novo);
      toast.success("Foto atualizada");
    } catch (e) {
      toast.error("Não foi possível salvar a foto", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const tirarFotoNativa = async () => {
    try {
      const { Camera: Cap, CameraResultType, CameraSource } = await import("@capacitor/camera");
      const perm = await Cap.checkPermissions();
      if (perm.camera !== "granted") {
        const req = await Cap.requestPermissions({ permissions: ["camera", "photos"] });
        if (req.camera !== "granted") return toast.error("Permissão de câmera negada");
      }
      const photo = await Cap.getPhoto({
        quality: 80,
        width: MAX_SIDE,
        correctOrientation: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        promptLabelHeader: "Foto de perfil",
        promptLabelPhoto: "Galeria",
        promptLabelPicture: "Tirar foto",
      });
      if (!photo.webPath) return;
      const blob = await (await fetch(photo.webPath)).blob();
      await enviar(new File([blob], "avatar.jpg", { type: blob.type || "image/jpeg" }));
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (/cancel/i.test(msg)) return;
      toast.error("Câmera indisponível", { description: msg });
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        {url ? (
          <img src={url} alt={`Foto de ${nome}`} className="size-16 rounded-full object-cover" />
        ) : (
          <div className="grid size-16 place-items-center rounded-full bg-brand font-display text-xl font-bold text-brand-foreground">
            {(nome ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 grid place-items-center rounded-full bg-background/70">
            <Loader2 className="size-5 animate-spin text-brand" />
          </div>
        )}
      </div>
      <div>
        {isNative() ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void tirarFotoNativa()}>
            <ImagePlus className="mr-2 size-4" /> Alterar foto
          </Button>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
            <Camera className="size-4" /> Alterar foto
            <input
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void enviar(f);
              }}
            />
          </label>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground">Tire uma foto ou escolha da galeria.</p>
      </div>
    </div>
  );
}
