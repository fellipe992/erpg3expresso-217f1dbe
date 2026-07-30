import { useRef, useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { geocodificar } from "@/lib/roteirizacao/geocode";
import { horaParaMinutos, normalizarHora, parseDecimal } from "@/lib/roteirizacao/parse";
import type { Entrega } from "@/lib/roteirizacao/tipos";

type Linha = {
  nf: string;
  cliente: string;
  endereco: string;
  peso: string;
  horario: string;
  descarga: string;
  observacoes: string;
};

const CABECALHOS: Record<keyof Linha, string[]> = {
  nf: ["nf", "nota", "notafiscal", "nota fiscal", "documento"],
  cliente: ["cliente", "destinatario", "destinatário", "nome"],
  endereco: ["endereco", "endereço", "local", "entrega", "logradouro"],
  peso: ["peso", "pesokg", "peso (kg)", "kg"],
  horario: ["horario", "horário", "janela", "hora", "horario entrega"],
  descarga: ["descarga", "tempo", "permanencia", "permanência", "minutos"],
  observacoes: ["observacoes", "observações", "obs", "observacao"],
};

const vazia = (): Linha => ({ nf: "", cliente: "", endereco: "", peso: "", horario: "", descarga: "20", observacoes: "" });

function mapear(registro: Record<string, unknown>): Linha {
  const linha = vazia();
  for (const [chave, valor] of Object.entries(registro)) {
    const k = chave.toString().trim().toLowerCase();
    (Object.keys(CABECALHOS) as (keyof Linha)[]).forEach((campo) => {
      if (CABECALHOS[campo].includes(k) && valor != null && String(valor).trim()) {
        linha[campo] = String(valor).trim();
      }
    });
  }
  return linha;
}

function erroDaLinha(l: Linha) {
  if (l.endereco.trim().length < 4) return "Endereço obrigatório";
  const p = parseDecimal(l.peso);
  if (p == null || p < 0) return "Peso inválido";
  if (l.horario && !normalizarHora(l.horario)) return "Horário inválido";
  return null;
}

export function ImportarEntregasDialog({
  open,
  onOpenChange,
  onImportar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImportar: (entregas: Entrega[]) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const lerArquivo = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    const novas = json.map(mapear).filter((l) => l.endereco || l.cliente || l.nf);
    if (!novas.length) return toast.error("Nenhuma linha reconhecida na planilha");
    setLinhas(novas.slice(0, 500));
  };

  const lerTexto = () => {
    const brutas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!brutas.length) return;
    const novas = brutas.map((l) => {
      const [endereco = "", cliente = "", nf = "", peso = "", horario = "", descarga = "", obs = ""] = l
        .split(";")
        .map((p) => p.trim());
      return { ...vazia(), endereco, cliente, nf, peso, horario, descarga: descarga || "20", observacoes: obs };
    });
    setLinhas(novas.slice(0, 500));
    setTexto("");
  };

  const atualizar = (i: number, campo: keyof Linha, valor: string) =>
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));

  const confirmar = async () => {
    const validas = linhas.filter((l) => !erroDaLinha(l));
    if (!validas.length) return toast.error("Corrija as linhas antes de importar");
    setCarregando(true);
    try {
      const geo = await geocodificar(validas.map((l) => l.endereco));
      const entregas: Entrega[] = [];
      const falhas: string[] = [];
      geo.forEach((g, i) => {
        const l = validas[i];
        if (g.lat == null) {
          falhas.push(l.endereco);
          return;
        }
        const hora = normalizarHora(l.horario);
        entregas.push({
          id: crypto.randomUUID(),
          nf: l.nf || undefined,
          cliente: l.cliente || undefined,
          endereco: g.enderecoFormatado ?? l.endereco,
          lat: g.lat,
          lng: g.lng,
          pesoKg: parseDecimal(l.peso) ?? 0,
          tempoDescargaMin: Number(parseDecimal(l.descarga) ?? 20),
          horarioEntrega: hora ?? undefined,
          janelaFimMin: horaParaMinutos(hora),
          observacoes: l.observacoes || undefined,
        });
      });
      onImportar(entregas);
      setLinhas([]);
      onOpenChange(false);
      toast.success(`${entregas.length} entrega(s) importada(s)`, {
        description: falhas.length ? `${falhas.length} endereço(s) não localizado(s)` : undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setCarregando(false);
    }
  };

  const invalidas = linhas.filter((l) => erroDaLinha(l)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importar entregas</DialogTitle>
          <DialogDescription>
            Planilha Excel/CSV com colunas NF, Cliente, Endereço, Peso, Horário, Descarga e Observações —
            ou cole a lista manualmente. Revise antes de confirmar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs">Arquivo (.xlsx, .csv)</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Colar lista (endereço; cliente; nf; peso; horário; descarga; obs)</Label>
            <div className="flex gap-2">
              <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} className="flex-1" />
              <Button type="button" variant="secondary" onClick={lerTexto}>
                Ler
              </Button>
            </div>
          </div>
        </div>

        {linhas.length > 0 && (
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {["", "NF", "Cliente", "Endereço", "Peso (kg)", "Horário", "Descarga", "Obs."].map((h) => (
                    <th key={h} className="p-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const erro = erroDaLinha(l);
                  return (
                    <tr key={i} className={erro ? "bg-destructive/10" : undefined}>
                      <td className="p-1 text-center">
                        {erro ? (
                          <span title={erro}>
                            <AlertTriangle className="size-3.5 text-destructive" />
                          </span>
                        ) : (
                          <FileSpreadsheet className="size-3.5 text-muted-foreground" />
                        )}
                      </td>
                      {(["nf", "cliente", "endereco", "peso", "horario", "descarga", "observacoes"] as (keyof Linha)[]).map(
                        (campo) => (
                          <td key={campo} className="p-1">
                            <Input
                              className="h-7 text-xs"
                              value={l[campo]}
                              onChange={(e) => atualizar(i, campo, e.target.value)}
                            />
                          </td>
                        ),
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {linhas.length} linha(s){invalidas ? ` · ${invalidas} com erro` : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setLinhas([])} disabled={!linhas.length}>
              Limpar
            </Button>
            <Button onClick={confirmar} disabled={!linhas.length || carregando}>
              {carregando && <Loader2 className="mr-2 size-4 animate-spin" />}
              Importar {linhas.length - invalidas} entrega(s)
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
