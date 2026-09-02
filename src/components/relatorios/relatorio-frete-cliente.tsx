import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Loader2, Receipt } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KpiCard, SecaoVazia } from "@/components/relatorios/kpi-card";
import { apurarViagem, type ViagemAjuste } from "@/lib/frete";
import { brl, dt, exportarExcel, exportarPdf, num } from "@/lib/export-utils";
import { hojeLocal } from "@/components/relatorios/filtros-financeiros";

type ViagemFrete = {
  id: string;
  codigo: string | null;
  cliente_id: string | null;
  status: string;
  data_saida: string | null;
  data_chegada: string | null;
  valor_frete: number | null;
  pedagio_cliente: number | null;
  frete_faixa_id: string | null;
  origem_cidade: string | null;
  destino_cidade: string | null;
  cliente?: { razao_social: string } | null;
};

type Linha = {
  clienteId: string;
  cliente: string;
  viagens: number;
  frete: number;
  pedagios: number;
  adicionais: number;
  descontos: number;
  apurado: number;
  receber: number;
  recebido: number;
  aberto: number;
  diferenca: number;
};

const diaRef = (v: ViagemFrete) => (v.data_chegada ?? v.data_saida ?? "").slice(0, 10);

export function RelatorioFreteCliente() {
  const [de, setDe] = useState(() => `${hojeLocal().slice(0, 7)}-01`);
  const [ate, setAte] = useState(() => hojeLocal());
  const [busca, setBusca] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["relatorio-frete-cliente"],
    queryFn: async () => {
      const [viag, aj, lanc] = await Promise.all([
        supabase
          .from("viagens")
          .select(
            "id, codigo, cliente_id, status, data_saida, data_chegada, valor_frete, pedagio_cliente, frete_faixa_id, origem_cidade, destino_cidade, cliente:clientes(razao_social)",
          )
          .neq("status", "cancelada"),
        supabase.from("viagem_ajustes").select("id, viagem_id, tipo, descricao, valor_cliente, valor_motorista"),
        supabase
          .from("financeiro_lancamentos")
          .select("id, viagem_id, valor, status")
          .eq("tipo", "receber")
          .not("viagem_id", "is", null)
          .neq("status", "cancelada"),
      ]);
      if (viag.error) throw viag.error;
      if (aj.error) throw aj.error;
      if (lanc.error) throw lanc.error;
      return {
        viagens: (viag.data ?? []) as unknown as ViagemFrete[],
        ajustes: (aj.data ?? []).map((a) => ({
          ...a,
          valor_cliente: Number(a.valor_cliente),
          valor_motorista: Number(a.valor_motorista),
        })) as ViagemAjuste[],
        lancamentos: (lanc.data ?? []).map((l) => ({ ...l, valor: Number(l.valor) })),
      };
    },
  });

  const detalhe = useMemo(() => {
    if (!data) return [];
    const q = busca.trim().toLowerCase();
    const porViagem = new Map<string, ViagemAjuste[]>();
    for (const a of data.ajustes) {
      const arr = porViagem.get(a.viagem_id) ?? [];
      arr.push(a);
      porViagem.set(a.viagem_id, arr);
    }
    return data.viagens
      .filter((v) => {
        const ref = diaRef(v);
        if (!ref || ref < de || ref > ate) return false;
        if (!q) return true;
        const nome = v.cliente?.razao_social ?? "";
        return nome.toLowerCase().includes(q) || (v.codigo ?? "").toLowerCase().includes(q);
      })
      .map((v) => {
        const ajustes = porViagem.get(v.id) ?? [];
        const ap = apurarViagem({
          freteCliente: v.valor_frete,
          pedagioCliente: v.pedagio_cliente,
          ajustes,
        }).cliente;
        const lancs = data.lancamentos.filter((l) => l.viagem_id === v.id);
        const receber = lancs.reduce((s, l) => s + l.valor, 0);
        const recebido = lancs.filter((l) => l.status === "pago").reduce((s, l) => s + l.valor, 0);
        return {
          viagem: v,
          ...ap,
          receber,
          recebido,
          aberto: receber - recebido,
          apuradoOk: Boolean(v.frete_faixa_id) || ajustes.length > 0 || Number(v.pedagio_cliente ?? 0) > 0,
        };
      })
      .sort((a, b) => (diaRef(b.viagem) > diaRef(a.viagem) ? 1 : -1));
  }, [data, de, ate, busca]);

  const linhas = useMemo<Linha[]>(() => {
    const map = new Map<string, Linha>();
    for (const d of detalhe) {
      const id = d.viagem.cliente_id ?? "sem-cliente";
      const nome = d.viagem.cliente?.razao_social ?? "Sem cliente";
      const l =
        map.get(id) ??
        {
          clienteId: id,
          cliente: nome,
          viagens: 0,
          frete: 0,
          pedagios: 0,
          adicionais: 0,
          descontos: 0,
          apurado: 0,
          receber: 0,
          recebido: 0,
          aberto: 0,
          diferenca: 0,
        };
      l.viagens += 1;
      l.frete += d.frete;
      l.pedagios += d.pedagio;
      l.adicionais += d.adicionais;
      l.descontos += d.descontos;
      l.apurado += d.total;
      l.receber += d.receber;
      l.recebido += d.recebido;
      l.aberto += d.aberto;
      l.diferenca = l.apurado - l.receber;
      map.set(id, l);
    }
    return Array.from(map.values()).sort((a, b) => b.apurado - a.apurado);
  }, [detalhe]);

  const totais = useMemo(
    () =>
      linhas.reduce(
        (a, r) => ({
          viagens: a.viagens + r.viagens,
          frete: a.frete + r.frete,
          pedagios: a.pedagios + r.pedagios,
          adicionais: a.adicionais + r.adicionais,
          descontos: a.descontos + r.descontos,
          apurado: a.apurado + r.apurado,
          receber: a.receber + r.receber,
          recebido: a.recebido + r.recebido,
          aberto: a.aberto + r.aberto,
        }),
        { viagens: 0, frete: 0, pedagios: 0, adicionais: 0, descontos: 0, apurado: 0, receber: 0, recebido: 0, aberto: 0 },
      ),
    [linhas],
  );

  const colunas = [
    "Cliente",
    "Viagens",
    "Frete",
    "Pedágios",
    "Adicionais",
    "Descontos",
    "Total apurado",
    "Contas a receber",
    "Recebido",
    "Em aberto",
    "Diferença",
  ];
  const linhasResumo = () =>
    linhas.map((r) => [
      r.cliente,
      r.viagens,
      r.frete,
      r.pedagios,
      r.adicionais,
      r.descontos,
      r.apurado,
      r.receber,
      r.recebido,
      r.aberto,
      r.diferenca,
    ]);

  const colunasViagem = [
    "Data",
    "OS",
    "Cliente",
    "Rota",
    "Frete",
    "Pedágio",
    "Adicionais",
    "Descontos",
    "Total apurado",
    "Contas a receber",
    "Apurado?",
  ];
  const linhasViagem = () =>
    detalhe.map((d) => [
      dt(diaRef(d.viagem)),
      d.viagem.codigo ?? "—",
      d.viagem.cliente?.razao_social ?? "Sem cliente",
      `${d.viagem.origem_cidade ?? "—"} → ${d.viagem.destino_cidade ?? "—"}`,
      d.frete,
      d.pedagio,
      d.adicionais,
      d.descontos,
      d.total,
      d.receber,
      d.apuradoOk ? "Sim" : "Não",
    ]);

  return (
    <div className="space-y-4">
      <Card className="p-3 md:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">De</Label>
            <Input type="date" className="h-9" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Até</Label>
            <Input type="date" className="h-9" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Buscar</Label>
            <Input
              className="h-9"
              placeholder="Cliente ou OS…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Período pela data de conclusão da viagem (com fallback para a saída) — mesma base do DRE e do contas a receber.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard label="Frete" value={brl(totais.frete)} tone="brand" icon={Receipt} />
        <KpiCard label="Pedágios" value={brl(totais.pedagios)} />
        <KpiCard label="Adicionais" value={brl(totais.adicionais)} tone="success" />
        <KpiCard label="Descontos" value={brl(totais.descontos)} tone="danger" />
        <KpiCard label="Total apurado" value={brl(totais.apurado)} tone="brand" sub={`${totais.viagens} viagem(ns)`} />
        <KpiCard
          label="Contas a receber"
          value={brl(totais.receber)}
          sub={`recebido ${brl(totais.recebido)} · aberto ${brl(totais.aberto)}`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportarExcel(`frete-por-cliente-${de}_${ate}.xlsx`, [
              { nome: "Por cliente", colunas, linhas: linhasResumo() },
              { nome: "Por viagem", colunas: colunasViagem, linhas: linhasViagem() },
            ])
          }
        >
          <FileSpreadsheet className="mr-2 size-4" /> Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportarPdf({
              nomeArquivo: `frete-por-cliente-${de}_${ate}.pdf`,
              titulo: "Frete apurado por cliente",
              subtitulo: "G3 Expresso",
              filtros: [`Período ${dt(de)} a ${dt(ate)}`, busca ? `Busca: ${busca}` : "Busca: —"],
              kpis: [
                ["Frete", brl(totais.frete)],
                ["Pedágios", brl(totais.pedagios)],
                ["Adicionais", brl(totais.adicionais)],
                ["Descontos", brl(totais.descontos)],
                ["Total apurado", brl(totais.apurado)],
                ["Contas a receber", brl(totais.receber)],
                ["Recebido", brl(totais.recebido)],
                ["Em aberto", brl(totais.aberto)],
              ],
              secoes: [
                {
                  titulo: "Resumo por cliente",
                  colunas,
                  linhas: linhas.map((r) => [
                    r.cliente,
                    r.viagens,
                    brl(r.frete),
                    brl(r.pedagios),
                    brl(r.adicionais),
                    brl(r.descontos),
                    brl(r.apurado),
                    brl(r.receber),
                    brl(r.recebido),
                    brl(r.aberto),
                    brl(r.diferenca),
                  ]),
                },
                {
                  titulo: "Detalhe por viagem",
                  colunas: colunasViagem,
                  linhas: detalhe.map((d) => [
                    dt(diaRef(d.viagem)),
                    d.viagem.codigo ?? "—",
                    d.viagem.cliente?.razao_social ?? "Sem cliente",
                    `${d.viagem.origem_cidade ?? "—"} → ${d.viagem.destino_cidade ?? "—"}`,
                    brl(d.frete),
                    brl(d.pedagio),
                    brl(d.adicionais),
                    brl(d.descontos),
                    brl(d.total),
                    brl(d.receber),
                    d.apuradoOk ? "Sim" : "Não",
                  ]),
                },
              ],
            })
          }
        >
          <FileText className="mr-2 size-4" /> PDF
        </Button>
        {isFetching && <Loader2 className="size-4 animate-spin self-center text-brand" />}
      </div>

      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="size-6 animate-spin text-brand" />
          </div>
        ) : linhas.length === 0 ? (
          <SecaoVazia />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Viagens</TableHead>
                  <TableHead className="text-right">Frete</TableHead>
                  <TableHead className="text-right">Pedágios</TableHead>
                  <TableHead className="text-right">Adicionais</TableHead>
                  <TableHead className="text-right">Descontos</TableHead>
                  <TableHead className="text-right">Total apurado</TableHead>
                  <TableHead className="text-right">Contas a receber</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="text-right">Em aberto</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((r) => (
                  <TableRow key={r.clienteId}>
                    <TableCell className="font-medium">{r.cliente}</TableCell>
                    <TableCell className="text-right font-mono">{r.viagens}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.frete)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.pedagios)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.adicionais)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{brl(r.descontos)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-brand">{brl(r.apurado)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.receber)}</TableCell>
                    <TableCell className="text-right font-mono text-brand">{brl(r.recebido)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(r.aberto)}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${Math.abs(r.diferenca) < 0.01 ? "text-muted-foreground" : "text-destructive"}`}
                    >
                      {brl(r.diferenca)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Total ({linhas.length} cliente(s))</TableCell>
                  <TableCell className="text-right font-mono">{num(totais.viagens, 0)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.frete)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.pedagios)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.adicionais)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{brl(totais.descontos)}</TableCell>
                  <TableCell className="text-right font-mono text-brand">{brl(totais.apurado)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.receber)}</TableCell>
                  <TableCell className="text-right font-mono text-brand">{brl(totais.recebido)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.aberto)}</TableCell>
                  <TableCell className="text-right font-mono">{brl(totais.apurado - totais.receber)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-border/60 p-4">
          <h3 className="font-display font-bold">Detalhe por viagem</h3>
          <p className="text-xs text-muted-foreground">Confere com o demonstrativo (DRE) de cada viagem e com o PDF.</p>
        </div>
        {detalhe.length === 0 ? (
          <SecaoVazia />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead className="text-right">Frete</TableHead>
                  <TableHead className="text-right">Pedágio</TableHead>
                  <TableHead className="text-right">Adicionais</TableHead>
                  <TableHead className="text-right">Descontos</TableHead>
                  <TableHead className="text-right">Total apurado</TableHead>
                  <TableHead className="text-right">A receber</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalhe.map((d) => (
                  <TableRow key={d.viagem.id}>
                    <TableCell className="text-xs text-muted-foreground">{dt(diaRef(d.viagem))}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="mr-2">{d.viagem.codigo ?? "—"}</span>
                      {d.apuradoOk && (
                        <Badge className="border-brand/40 bg-brand-subtle text-brand" variant="outline">
                          Apurado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{d.viagem.cliente?.razao_social ?? "Sem cliente"}</TableCell>
                    <TableCell className="text-xs">
                      {d.viagem.origem_cidade ?? "—"} → {d.viagem.destino_cidade ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{brl(d.frete)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(d.pedagio)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(d.adicionais)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">{brl(d.descontos)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold text-brand">{brl(d.total)}</TableCell>
                    <TableCell className="text-right font-mono">{brl(d.receber)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
