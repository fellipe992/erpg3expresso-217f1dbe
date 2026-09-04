import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { baixarLoteFiscal } from "@/lib/fiscal.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Base = "viagem" | "fechamento";

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function DownloadLoteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const baixar = useServerFn(baixarLoteFiscal);
  const [base, setBase] = useState<Base>("viagem");
  const [viagemId, setViagemId] = useState("");
  const [fechamentoId, setFechamentoId] = useState("");
  const [tipo, setTipo] = useState<"todos" | "cte" | "mdfe">("todos");

  const { data: viagens = [] } = useQuery({
    queryKey: ["viagens-download-fiscal"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("viagens")
        .select("id, codigo, origem_cidade, destino_cidade, data_saida")
        .order("data_saida", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: fechamentos = [] } = useQuery({
    queryKey: ["fechamentos-download-fiscal"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("fechamentos")
        .select("id, numero, tipo, periodo_inicio, periodo_fim, status")
        .eq("tipo", "cliente")
        .neq("status", "cancelado")
        .order("numero", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const gerar = useMutation({
    mutationFn: async () => {
      const res = await baixar({
        data: {
          viagemId: base === "viagem" ? viagemId || null : null,
          fechamentoId: base === "fechamento" ? fechamentoId || null : null,
          tipo,
        },
      });
      const arquivos = res.arquivos ?? [];
      if (!arquivos.length) throw new Error("Nenhum documento autorizado encontrado para essa seleção.");

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let incluidos = 0;
      for (const a of arquivos) {
        if (a.pdf) {
          zip.file(`${a.nome}.pdf`, bytes(a.pdf));
          incluidos++;
        }
        if (a.xml) {
          zip.file(`${a.nome}.xml`, bytes(a.xml));
          incluidos++;
        }
      }
      if (!incluidos) throw new Error("Os documentos foram encontrados, mas a Bsoft não devolveu os arquivos.");

      const blob = await zip.generateAsync({ type: "blob" });
      const nomeZip =
        base === "viagem"
          ? `documentos-fiscais-OS-${viagens.find((v) => v.id === viagemId)?.codigo ?? "viagem"}.zip`
          : `documentos-fiscais-fechamento-${
              fechamentos.find((f) => f.id === fechamentoId)?.numero ?? "cliente"
            }.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeZip;
      a.click();
      URL.revokeObjectURL(url);
      return arquivos.length;
    },
    onSuccess: (qtd) => toast.success(`${qtd} documento(s) baixado(s) em um arquivo compactado.`),
    onError: (e: Error) => toast.error("Não foi possível baixar os arquivos", { description: e.message }),
  });

  const pronto = base === "viagem" ? !!viagemId : !!fechamentoId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Baixar XML e PDF em lote</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Agrupar por</Label>
            <Select value={base} onValueChange={(v) => setBase(v as Base)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viagem">Viagem</SelectItem>
                <SelectItem value="fechamento">Fechamento do cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {base === "viagem" ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Viagem</Label>
              <Select value={viagemId} onValueChange={setViagemId}>
                <SelectTrigger><SelectValue placeholder="Selecione a viagem" /></SelectTrigger>
                <SelectContent>
                  {viagens.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      OS {v.codigo ?? "—"} · {v.origem_cidade ?? "?"} → {v.destino_cidade ?? "?"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Fechamento</Label>
              <Select value={fechamentoId} onValueChange={setFechamentoId}>
                <SelectTrigger><SelectValue placeholder="Selecione o fechamento" /></SelectTrigger>
                <SelectContent>
                  {fechamentos.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      #{f.numero} · {f.periodo_inicio} a {f.periodo_fim}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Documentos</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">CT-e e MDF-e</SelectItem>
                <SelectItem value="cte">Somente CT-e</SelectItem>
                <SelectItem value="mdfe">Somente MDF-e</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            São incluídos apenas documentos autorizados ou encerrados. O download vem em um único arquivo compactado com
            o PDF e o XML de cada documento.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => gerar.mutate()} disabled={!pronto || gerar.isPending}>
            {gerar.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Download className="mr-2 size-4" />
            )}
            Baixar arquivos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
