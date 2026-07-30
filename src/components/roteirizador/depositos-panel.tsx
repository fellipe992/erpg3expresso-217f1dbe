import { useState } from "react";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalInput } from "@/components/planejador/local-input";
import { geocodificar } from "@/lib/roteirizacao/geocode";
import type { Deposito } from "@/lib/roteirizacao/tipos";

export function DepositosPanel({
  depositos,
  onChange,
}: {
  depositos: Deposito[];
  onChange: (d: Deposito[]) => void;
}) {
  const [nome, setNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [carregando, setCarregando] = useState(false);

  const adicionar = async () => {
    if (endereco.trim().length < 4) return toast.error("Informe o endereço do CD");
    setCarregando(true);
    try {
      const [r] = await geocodificar([endereco]);
      if (r?.lat == null) throw new Error(r?.erro ?? "Endereço não localizado");
      onChange([
        ...depositos,
        {
          id: crypto.randomUUID(),
          nome: nome.trim() || `CD ${depositos.length + 1}`,
          endereco: r.enderecoFormatado ?? endereco,
          lat: r.lat,
          lng: r.lng!,
        },
      ]);
      setNome("");
      setEndereco("");
      toast.success("Centro de distribuição cadastrado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao localizar o CD");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs">Centros de distribuição (origem)</Label>
        <div className="grid gap-2">
          <Input
            placeholder="Nome (ex.: CD São Paulo)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <div className="flex gap-2">
            <LocalInput
              className="flex-1"
              value={endereco}
              onChange={setEndereco}
              placeholder="Endereço do CD"
            />
            <Button type="button" variant="secondary" onClick={adicionar} disabled={carregando}>
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {depositos.length === 0 && (
          <li className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Cadastre ao menos um CD para iniciar a roteirização.
          </li>
        )}
        {depositos.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
            <MapPin className="size-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{d.endereco}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remover ${d.nome}`}
              onClick={() => onChange(depositos.filter((x) => x.id !== d.id))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
