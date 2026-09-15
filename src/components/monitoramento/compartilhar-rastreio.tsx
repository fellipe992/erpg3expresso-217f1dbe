import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Link2, Loader2, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { criarLinkRastreio, revogarLinkRastreio } from "@/lib/rastreio-publico.functions";

/** Domínio público definitivo — links de rastreio nunca devem apontar para o preview do editor. */
const DOMINIO_PUBLICO = "https://erpg3expresso.lovable.app";

function baseUrlPublica() {
  const origin = window.location.origin;
  const interno =
    origin.includes("lovableproject.com") ||
    origin.includes("id-preview--") ||
    origin.includes("-dev.lovable.app") ||
    origin.includes("localhost");
  return interno ? DOMINIO_PUBLICO : origin;
}

/**
 * Botão + diálogo para gerar o link público de rastreio de uma viagem.
 * O link mostra apenas o mapa com a posição do veículo.
 */
export function CompartilharRastreio({ viagemId }: { viagemId: string }) {
  const criar = useServerFn(criarLinkRastreio);
  const revogar = useServerFn(revogarLinkRastreio);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function abrir() {
    setOpen(true);
    if (url) return;
    setBusy(true);
    try {
      const { token } = await criar({ data: { viagemId } });
      setUrl(`${baseUrlPublica()}/rastreio/${token}`);
    } catch (e) {
      toast.error("Não foi possível gerar o link", { description: (e as Error).message });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function copiar() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Copie o link manualmente");
    }
  }

  async function compartilhar() {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Acompanhe sua entrega", url });
        return;
      } catch {
        return;
      }
    }
    void copiar();
  }

  async function desativar() {
    setBusy(true);
    try {
      await revogar({ data: { viagemId } });
      setUrl(null);
      setOpen(false);
      toast.success("Link desativado");
    } catch (e) {
      toast.error("Não foi possível desativar", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 flex-1 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          void abrir();
        }}
      >
        <Link2 className="mr-1 size-3" /> Compartilhar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Compartilhar rastreio</DialogTitle>
            <DialogDescription>
              Quem abrir o link vê apenas o mapa com a posição atual do veículo. Nenhum dado do
              motorista é exibido e o link deixa de funcionar quando a viagem é concluída.
            </DialogDescription>
          </DialogHeader>

          {busy && !url ? (
            <div className="grid place-items-center py-6">
              <Loader2 className="size-5 animate-spin text-brand" />
            </div>
          ) : (
            url && (
              <div className="space-y-3">
                <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void copiar()}>
                    {copiado ? <Check className="mr-1 size-4" /> : <Copy className="mr-1 size-4" />}
                    {copiado ? "Copiado" : "Copiar link"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void compartilhar()}>
                    <Share2 className="mr-1 size-4" /> Compartilhar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void desativar()}>
                    <Trash2 className="mr-1 size-4" /> Desativar link
                  </Button>
                </div>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
