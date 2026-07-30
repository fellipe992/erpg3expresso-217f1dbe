import { useState } from "react";
import { Loader2, MapPin, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LocalInput } from "@/components/planejador/local-input";
import { supabase } from "@/integrations/supabase/client";
import type { Deposito, Entrega } from "@/lib/roteirizacao/tipos";
import { num } from "@/lib/roteirizacao/format";

type Geocodificado = {
  endereco: string;
  enderecoFormatado?: string;
  lat?: number;
  lng?: number;
  regiao?: string | null;
  erro?: string;
};

async function geocodificar(enderecos: string[]): Promise<Geocodificado[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada");
  const res = await fetch("/api/roteirizador-geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ enderecos }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = (await res.json()) as { resultados: Geocodificado[] };
  return json.resultados;
}

export function EntregasPanel({
  entregas,
  onChange,
  deposito,
  onDeposito,
}: {
  entregas: Entrega[];
  onChange: (e: Entrega[]) => void;
  deposito: Deposito | null;
  onDeposito: (d: Deposito | null) => void;
}) {
  const [enderecoBase, setEnderecoBase] = useState(deposito?.endereco ?? "");
  const [endereco, setEndereco] = useState("");
  const [cliente, setCliente] = useState("");
  const [peso, setPeso] = useState("500");
  const [volume, setVolume] = useState("");
  const [tempo, setTempo] = useState("20");
  const [receita, setReceita] = useState("");
  const [lote, setLote] = useState("");
  const [carregando, setCarregando] = useState(false);

  const definirBase = async () => {
    if (enderecoBase.trim().length < 4) return;
    setCarregando(true);
    try {
      const [r] = await geocodificar([enderecoBase]);
      if (r?.lat == null) throw new Error(r?.erro ?? "Endereço não localizado");
      onDeposito({ endereco: r.enderecoFormatado ?? enderecoBase, lat: r.lat, lng: r.lng! });
      toast.success("Base de saída definida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao localizar a base");
    } finally {
      setCarregando(false);
    }
  };

  const adicionar = async () => {
    if (endereco.trim().length < 4) return;
    setCarregando(true);
    try {
      const [r] = await geocodificar([endereco]);
      if (r?.lat == null) throw new Error(r?.erro ?? "Endereço não localizado");
      onChange([
        ...entregas,
        {
          id: crypto.randomUUID(),
          endereco: r.enderecoFormatado ?? endereco,
          cliente: cliente || undefined,
          regiao: r.regiao ?? undefined,
          lat: r.lat,
          lng: r.lng,
          pesoKg: Number(peso) || 0,
          volumeM3: volume ? Number(volume) : undefined,
          tempoDescargaMin: Number(tempo) || 15,
          receita: receita ? Number(receita) : undefined,
        },
      ]);
      setEndereco("");
      setCliente("");
      setReceita("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao adicionar entrega");
    } finally {
      setCarregando(false);
    }
  };

  const importarLote = async () => {
    const linhas = lote
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 200);
    if (!linhas.length) return;
    setCarregando(true);
    try {
      const parsed = linhas.map((l) => {
        const [end, pesoTxt, tempoTxt, receitaTxt] = l.split(";").map((p) => p?.trim());
        return { end, peso: Number(pesoTxt) || 500, tempo: Number(tempoTxt) || 15, receita: Number(receitaTxt) || undefined };
      });
      const geo = await geocodificar(parsed.map((p) => p.end));
      const novas: Entrega[] = [];
      geo.forEach((g, i) => {
        if (g.lat == null) return;
        novas.push({
          id: crypto.randomUUID(),
          endereco: g.enderecoFormatado ?? parsed[i].end,
          regiao: g.regiao ?? undefined,
          lat: g.lat,
          lng: g.lng,
          pesoKg: parsed[i].peso,
          tempoDescargaMin: parsed[i].tempo,
          receita: parsed[i].receita,
        });
      });
      onChange([...entregas, ...novas]);
      setLote("");
      toast.success(`${novas.length} entrega(s) importada(s)`, {
        description: geo.length - novas.length ? `${geo.length - novas.length} endereço(s) não localizado(s)` : undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setCarregando(false);
    }
  };

  const pesoTotal = entregas.reduce((s, e) => s + e.pesoKg, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label>Base de saída (CD / garagem)</Label>
          <div className="flex gap-2">
            <LocalInput
              className="flex-1"
              value={enderecoBase}
              onChange={setEnderecoBase}
              placeholder="Endereço do centro de distribuição"
            />
            <Button type="button" variant="secondary" onClick={definirBase} disabled={carregando}>
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            </Button>
          </div>
          {deposito && (
            <p className="text-xs text-muted-foreground">Base definida: {deposito.endereco}</p>
          )}
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <Label>Nova entrega</Label>
          <LocalInput value={endereco} onChange={setEndereco} placeholder="Endereço de entrega" />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Input placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
            <Input placeholder="Peso (kg)" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} />
            <Input placeholder="Vol (m³)" inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} />
            <Input placeholder="Descarga (min)" inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value)} />
            <Input placeholder="Frete (R$)" inputMode="decimal" value={receita} onChange={(e) => setReceita(e.target.value)} />
          </div>
          <Button type="button" onClick={adicionar} disabled={carregando} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Adicionar entrega
          </Button>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <Label>Importar em lote</Label>
          <Textarea
            rows={4}
            value={lote}
            onChange={(e) => setLote(e.target.value)}
            placeholder={"endereço; peso; minutos; frete\nAv. Paulista 1000, São Paulo; 800; 20; 450"}
          />
          <Button type="button" variant="secondary" onClick={importarLote} disabled={carregando} className="w-full">
            <Upload className="mr-2 h-4 w-4" /> Importar lista
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Entregas ({entregas.length})</h3>
            <p className="text-xs text-muted-foreground">{num(pesoTotal)} kg no total</p>
          </div>
          {entregas.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              Limpar
            </Button>
          )}
        </div>
        <div className="max-h-[460px] space-y-2 overflow-auto pr-1">
          {entregas.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma entrega adicionada.
            </p>
          )}
          {entregas.map((e, i) => (
            <div
              key={e.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
            >
              <Badge variant="outline" className="shrink-0">{i + 1}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.cliente || e.endereco.split(",")[0]}</p>
                <p className="truncate text-xs text-muted-foreground">{e.endereco}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>{num(e.pesoKg)} kg</p>
                <p>{e.tempoDescargaMin} min</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remover entrega"
                onClick={() => onChange(entregas.filter((x) => x.id !== e.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
