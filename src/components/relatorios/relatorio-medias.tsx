import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Gauge, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMediasPorViagem } from "@/lib/medias-viagem";
import { exportarExcel } from "@/lib/export-utils";

const num = (n: number, d = 2) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dtBR = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

/**
 * Média de consumo por viagem: usa a data da viagem (saída) como competência,
 * o km efetivamente rodado e os litros abastecidos no percurso.
 */
export function RelatorioMedias() {
  const hoje = new Date();
  const ini = new Date();
  ini.setDate(ini.getDate() - 60);
  const [de, setDe] = useState(ini.toISOString().slice(0, 10));
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10));
  const [veiculoId, setVeiculoId] = useState("all");

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-select"],
    queryFn: async () => {
      const { data } = await supabase.from("veiculos").select("id, placa, modelo").eq("ativo", true).order("placa");
      return (data ?? []) as { id: string; placa: string; modelo: string | null }[];
    },
  });

  const { data: rows = [], isLoading } = useMediasPorViagem({
    de,
    ate,
    veiculoId: veiculoId === "all" ? null : veiculoId,
  });

  const comMedia = rows.filter((r) => r.media > 0);
  const kmTotal = comMedia.reduce((s, r) => s + r.km, 0);
  const litrosTotal = comMedia.reduce((s, r) => s + r.litros, 0);
  const mediaGeral = litrosTotal > 0 ? kmTotal / litrosTotal : 0;
  const melhor = comMedia.reduce<typeof comMedia[number] | null>((m, r) => (!m || r.media > m.media ? r : m), null);
  const pior = comMedia.reduce<typeof comMedia[number] | null>((m, r) => (!m || r.media < m.media ? r : m), null);

  const exportar = () => {
    exportarExcel(`medias-por-viagem-${de}-a-${ate}`, [
      {
        nome: "Médias por viagem",
        cabecalho: ["OS", "Data", "Placa", "Motorista", "Cliente", "Rota", "KM", "Litros", "km/L", "Combustível", "R$/km"],
        linhas: rows.map((r) => [
          r.codigo ?? r.viagemId.slice(0, 6).toUpperCase(),
          dtBR(r.data),
          r.placa,
          r.motorista,
          r.cliente,
          r.rota,
          Number(r.km.toFixed(0)),
          Number(r.litros.toFixed(2)),
          r.media > 0 ? Number(r.media.toFixed(2)) : "",
          Number(r.gastoCombustivel.toFixed(2)),
          r.custoKm > 0 ? Number(r.custoKm.toFixed(3)) : "",
        ]),
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Data da viagem — de</Label>
            <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Data da viagem — até</Label>
            <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Veículo</Label>
            <Select value={veiculoId} onValueChange={setVeiculoId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {veiculos.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.placa}{v.modelo ? ` · ${v.modelo}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={exportar} disabled={rows.length === 0}>
              <FileSpreadsheet className="mr-2 size-4" /> Excel
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Média geral do período</p>
          <p className="font-display text-lg font-semibold">{mediaGeral > 0 ? `${num(mediaGeral)} km/L` : "—"}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Viagens com média apurada</p>
          <p className="font-display text-lg font-semibold">{comMedia.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Melhor viagem</p>
          <p className="font-display text-lg font-semibold">{melhor ? `${num(melhor.media)} km/L` : "—"}</p>
          <p className="text-[11px] text-muted-foreground">{melhor ? `${melhor.placa} · OS ${melhor.codigo ?? "—"}` : ""}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Pior viagem</p>
          <p className="font-display text-lg font-semibold">{pior ? `${num(pior.media)} km/L` : "—"}</p>
          <p className="text-[11px] text-muted-foreground">{pior ? `${pior.placa} · OS ${pior.codigo ?? "—"}` : ""}</p>
        </Card>
      </div>

      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            <Gauge className="mx-auto mb-2 size-6 opacity-60" />
            Nenhuma viagem concluída com quilometragem no período.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Placa</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead className="text-right">KM</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">Média</TableHead>
                <TableHead className="text-right">R$/km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.viagemId}>
                  <TableCell className="font-mono text-xs">{r.codigo ?? r.viagemId.slice(0, 6).toUpperCase()}</TableCell>
                  <TableCell className="text-xs">{dtBR(r.data)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.placa}</TableCell>
                  <TableCell className="text-xs">{r.motorista}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{num(r.km, 0)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{r.litros > 0 ? num(r.litros) : "—"}</TableCell>
                  <TableCell className="text-right text-xs font-medium tabular-nums">{r.media > 0 ? `${num(r.media)} km/L` : "—"}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{r.custoKm > 0 ? brl(r.custoKm) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
