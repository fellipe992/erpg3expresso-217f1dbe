import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { linkPastaOneDrive } from "@/lib/onedrive.functions";

/**
 * Gera o link compartilhado da pasta no OneDrive (geral ou de um motorista),
 * para abrir de qualquer computador ou celular. Somente equipe interna.
 */
export function LinkPastaOneDrive({ motoristaId, compacto }: { motoristaId?: string; compacto?: boolean }) {
  const gerar = useServerFn(linkPastaOneDrive);
  const m = useMutation({
    mutationFn: () => gerar({ data: { motoristaId } }),
    onError: (e) => toast.error("Não foi possível gerar o link", { description: (e as Error).message }),
  });
  const link = m.data?.compartilhado ?? m.data?.webUrl ?? null;

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      window.prompt("Copie o link da pasta:", link);
    }
  };

  if (!link) {
    return (
      <Button variant="outline" size={compacto ? "sm" : "default"} onClick={() => m.mutate()} disabled={m.isPending}>
        {m.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Link2 className="mr-2 size-4" />}
        {motoristaId ? "Link da pasta no OneDrive" : "Link da pasta geral no OneDrive"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size={compacto ? "sm" : "default"}>
        <a href={link} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="mr-2 size-4" /> Abrir pasta no OneDrive
        </a>
      </Button>
      <Button variant="ghost" size={compacto ? "sm" : "default"} onClick={() => void copiar()}>
        <Copy className="mr-2 size-4" /> Copiar link
      </Button>
      {!m.data?.compartilhado && (
        <span className="text-[11px] text-muted-foreground">Abre pedindo login na conta Microsoft.</span>
      )}
    </div>
  );
}
