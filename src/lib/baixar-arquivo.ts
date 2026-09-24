import { toast } from "sonner";
import { isNative } from "@/lib/native";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Baixa um arquivo a partir de uma URL (assinada ou externa).
 * - No app (Android): grava na pasta Documentos do aparelho.
 * - No navegador: dispara o download direto (sem pop-up, que o celular bloqueia).
 */
export async function baixarArquivo(url: string, nome: string) {
  const nomeSeguro = nome.replace(/[\\/:*?"<>|]+/g, "_") || "arquivo";
  let blob: Blob;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    blob = await res.blob();
  } catch {
    // Sem acesso direto ao conteúdo: abre a própria URL na mesma janela.
    window.location.href = url;
    return;
  }

  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const data = await blobToBase64(blob);
      await Filesystem.writeFile({ path: nomeSeguro, data, directory: Directory.Documents, recursive: true });
      toast.success("Arquivo salvo", { description: `Pasta Documentos: ${nomeSeguro}` });
      return;
    } catch (e) {
      console.warn("Falha ao salvar no aparelho", e);
    }
  }

  const obj = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = obj;
  a.download = nomeSeguro;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(obj), 60_000);
}
