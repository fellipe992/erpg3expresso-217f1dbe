import { useState } from "react";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LocalInput } from "@/components/planejador/local-input";
import { geocodificar } from "@/lib/roteirizacao/geocode";
import { horaParaMinutos, kg, normalizarHora, parseDecimal } from "@/lib/roteirizacao/parse";
import { corDaEntrega } from "@/lib/roteirizacao/regioes";
import type { Entrega } from "@/lib/roteirizacao/tipos";

export function EntregasPanel({
  entregas,
  onChange,
  onImportar,
  selecionada,
  onSelecionar,
}: {
  entregas: Entrega[];
  onChange: (e: Entrega[]) => void;
  onImportar: () => void;
  selecionada?: string | null;
  onSelecionar?: (id: string) => void;
}) {
  const [nf, setNf] = useState("");
  const [cliente, setCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [peso, setPeso] = useState("");
  const [horario, setHorario] = useState("");
  const [tempo, setTempo] = useState("20");
  const [observacoes, setObservacoes] = useState("");
  const [carregando, setCarregando] = useState(false);

  const adicionar = async () => {
    if (endereco.trim().length < 4) return toast.error("Informe o endereço da entrega");
    const pesoKg = parseDecimal(peso);
    if (pesoKg == null || pesoKg < 0) return toast.error("Peso inválido");
    setCarregando(true);
    try {
      const [r] = await geocodificar([endereco]);
      if (r?.lat == null) throw new Error(r?.erro ?? "Endereço não localizado");
      const hora = normalizarHora(horario);
      onChange([
        ...entregas,
        {
          id: crypto.randomUUID(),
          nf: nf.trim() || undefined,
          cliente: cliente.trim() || undefined,
          endereco: r.enderecoFormatado ?? endereco,
          lat: r.lat,
          lng: r.lng,
          pesoKg,
          tempoDescargaMin: Number(parseDecimal(tempo) ?? 20),
          horarioEntrega: hora ?? undefined,
          janelaFimMin: horaParaMinutos(hora),
          observacoes: observacoes.trim() || undefined,
        },
      ]);
      setNf("");
      setCliente("");
      setEndereco("");
      setPeso("");
      setHorario("");
      setObservacoes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao adicionar entrega");
    } finally {
      setCarregando(false);
    }
  };

  const pesoTotal = entregas.reduce((s, e) => s + e.pesoKg, 0);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Nova entrega</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Nota fiscal" value={nf} onChange={(e) => setNf(e.target.value)} />
          <Input placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </div>
        <LocalInput value={endereco} onChange={setEndereco} placeholder="Endereço de entrega" />
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Peso (kg)</Label>
            <Input placeholder="149,540" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Horário</Label>
            <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Descarga (min)</Label>
            <Input inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value)} />
          </div>
        </div>
        <Textarea
          rows={2}
          placeholder="Observações (opcional)"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" onClick={adicionar} disabled={carregando}>
            {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Adicionar
          </Button>
          <Button type="button" variant="secondary" onClick={onImportar}>
            <Upload className="mr-2 h-4 w-4" /> Importar
          </Button>
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">
            Entregas ({entregas.length}){" "}
            <span className="font-normal text-muted-foreground">· {kg(pesoTotal)}</span>
          </p>
          {entregas.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              Limpar
            </Button>
          )}
        </div>
        <ul className="space-y-2">
          {entregas.length === 0 && (
            <li className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Nenhuma entrega cadastrada.
            </li>
          )}
          {entregas.map((e, i) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelecionar?.(e.id)}
                className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                  selecionada === e.id ? "border-brand bg-accent" : "border-border bg-card hover:bg-accent/50"
                }`}
              >
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ backgroundColor: corDaEntrega(e) }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.cliente || e.endereco.split(",")[0]}
                    {e.nf ? <span className="ml-1 text-xs text-muted-foreground">NF {e.nf}</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{e.endereco}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {e.regiao && (
                      <Badge variant="outline" className="text-[10px]">
                        {e.regiao}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">{kg(e.pesoKg)}</Badge>
                    {e.horarioEntrega && (
                      <Badge variant="outline" className="text-[10px]">até {e.horarioEntrega}</Badge>
                    )}
                  </span>
                </span>
                <Trash2
                  className="size-4 shrink-0 text-muted-foreground hover:text-destructive"
                  role="button"
                  aria-label="Remover entrega"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onChange(entregas.filter((x) => x.id !== e.id));
                  }}
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
