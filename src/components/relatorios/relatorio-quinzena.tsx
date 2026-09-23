import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { categoriaDespesa, useBiDados, type LancBi } from "@/hooks/use-bi-dados";
import { brl, dt, exportarExcel, exportarPdf, pct } from "@/lib/export-utils";
import { calcularVencimento, periodoQuinzena, prazoLabel } from "@/lib/prazo-pagamento";
import { KpiCard } from "@/components/relatorios/kpi-card";
import { Field, MultiSelect, hojeLocal, selecionado } from "@/components/relatorios/filtros-financeiros";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Regra = { prazo_pagamento: string | null; prazo_dias: number | null };

function situacao(l: LancBi, hoje: string) {
  if (l.status === "pago") return { txt: "Pago", tone: "secondary" as const };
  if ((l.data_vencimento ?? "") < hoje) return { txt: "Atrasado", tone: "destructive" as const };
  return { txt: "A vencer", tone: "outline" as const };
}

function Tabela({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: React.ReactNode[][] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b px-4 py-2 font-display text-sm font-bold">{titulo}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
            <tr>{colunas.map((c) => <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>)}</tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={colunas.length} className="px-3 py-6 text-center text-xs text-muted-foreground">Sem dados na quinzena.</td></tr>
            )}
            {linhas.map((l, i) => (
              <tr key={i} className="border-t">{l.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function RelatorioQuinzena() {
  const hoje = hojeLocal();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [q, setQ] = useState<1 | 2>(Number(hoje.slice(8, 10)) <= 15 ? 1 : 2);
  const [clienteIds, setClienteIds] = useState<string[]>([]);
  const [veiculoIds, setVeiculoIds] = useState<string[]>([]);
  const [motoristaIds, setMotoristaIds] = useState<string[]>([]);
  const per = periodoQuinzena(mes, q);
  const { data, isLoading } = useBiDados(per.de, per.ate);

  const { data: regras } = useQuery({
    queryKey: ["prazo-regras"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [c, m] = await Promise.all([
        supabase.from("clientes").select("id, prazo_pagamento, prazo_dias"),
        supabase.from("motoristas").select("id, prazo_pagamento, prazo_dias"),
      ]);
      const cli = new Map<string, Regra>(); const mot = new Map<string, Regra>();
      (c.data ?? []).forEach((r) => cli.set(r.id, r as Regra));
      (m.data ?? []).forEach((r) => mot.set(r.id, r as Regra));
      return { cli, mot };
    },
  });

  const r = useMemo(() => {
    if (!data) return null;
    const lancs = data.lancamentos.filter(
      (l) => l.status !== "cancelado" && l.competencia >= per.de && l.competencia <= per.ate &&
        selecionado(clienteIds, l.cliente_id) && selecionado(veiculoIds, l.veiculo_id) && selecionado(motoristaIds, l.motorista_id),
    );
    const viagens = data.viagens.filter(
      (v) => selecionado(clienteIds, v.cliente_id) && selecionado(veiculoIds, v.veiculo_id) && selecionado(motoristaIds, v.motorista_id),
    );
    const previsto = (l: LancBi) => {
      if (l.data_vencimento) return l.data_vencimento;
      const rg = l.tipo === "receber" ? regras?.cli.get(l.cliente_id ?? "") : regras?.mot.get(l.motorista_id ?? "");
      return calcularVencimento(rg?.prazo_pagamento, per.ate, rg?.prazo_dias);
    };
    const rec = lancs.filter((l) => l.tipo === "receber");
    const pag = lancs.filter((l) => l.tipo === "pagar");
    const soma = (a: LancBi[]) => a.reduce((s, l) => s + l.valor, 0);
    const entradas = soma(rec), saidas = soma(pag);

    const agrupar = (a: LancBi[], chave: (l: LancBi) => string, nome: (k: string) => string) => {
      const m = new Map<string, { nome: string; total: number; pago: number; datas: Set<string>; atrasado: number }>();
      for (const l of a) {
        const k = chave(l);
        if (!m.has(k)) m.set(k, { nome: nome(k), total: 0, pago: 0, datas: new Set(), atrasado: 0 });
        const g = m.get(k)!;
        g.total += l.valor;
        if (l.status === "pago") g.pago += l.valor;
        else if (previsto(l) < hoje) g.atrasado += l.valor;
        g.datas.add(l.status === "pago" && l.data_pagamento ? l.data_pagamento : previsto(l));
      }
      return Array.from(m.values()).sort((x, y) => y.total - x.total);
    };
    const porCliente = agrupar(rec, (l) => l.cliente_id ?? "", (k) => data.nomeCliente(k || null));
    const porMotorista = agrupar(pag.filter((l) => l.motorista_id && (l.fechamento_id || l.viagem_id)), (l) => l.motorista_id!, (k) => data.nomeMotorista(k));

    const placas = new Map<string, { placa: string; receita: number; comb: number; manut: number; outras: number; lucro: number }>();
    for (const v of viagens) {
      const k = v.veiculo_id ?? "";
      if (!placas.has(k)) placas.set(k, { placa: v.placa || "—", receita: 0, comb: 0, manut: 0, outras: 0, lucro: 0 });
      const p = placas.get(k)!;
      p.receita += v.receita; p.comb += v.combustivel; p.manut += v.manutencao;
      p.outras += v.outrasDespesas + v.pedagio; p.lucro += v.lucro;
    }

    const agenda = new Map<string, { rec: number; pag: number }>();
    for (const l of lancs) {
      const d = l.status === "pago" && l.data_pagamento ? l.data_pagamento : previsto(l);
      if (!agenda.has(d)) agenda.set(d, { rec: 0, pag: 0 });
      agenda.get(d)![l.tipo === "receber" ? "rec" : "pag"] += l.valor;
    }

    return {
      entradas, saidas, resultado: entradas - saidas,
      margem: entradas ? ((entradas - saidas) / entradas) * 100 : 0,
      recebido: soma(rec.filter((l) => l.status === "pago")),
      pago: soma(pag.filter((l) => l.status === "pago")),
      porCliente, porMotorista,
      placas: Array.from(placas.values()).sort((a, b) => b.receita - a.receita),
      despesas: pag.sort((a, b) => a.competencia.localeCompare(b.competencia)),
      agenda: Array.from(agenda.entries()).sort(([a], [b]) => a.localeCompare(b)),
      previsto,
    };
  }, [data, regras, per.de, per.ate, clienteIds, veiculoIds, motoristaIds, hoje]);

  const tabelas = r ? {
    clientes: r.porCliente.map((g) => [g.nome, brl(g.total), brl(g.pago), brl(g.atrasado), [...g.datas].sort().map(dt).join(", ")]),
    motoristas: r.porMotorista.map((g) => [g.nome, brl(g.total), brl(g.pago), brl(g.atrasado), [...g.datas].sort().map(dt).join(", ")]),
    placas: r.placas.map((p) => [p.placa, brl(p.receita), brl(p.comb), brl(p.manut), brl(p.outras), brl(p.lucro)]),
    despesas: r.despesas.map((l) => [dt(l.competencia), categoriaDespesa(l.categoria) === "Outros" ? l.categoria ?? "—" : categoriaDespesa(l.categoria), l.descricao, brl(l.valor), l.status === "pago" ? `Pago ${dt(l.data_pagamento)}` : `Previsto ${dt(r.previsto(l))}`]),
    agenda: r.agenda.map(([d, v]) => [dt(d), brl(v.rec), brl(v.pag), brl(v.rec - v.pag)]),
  } : null;

  const C = {
    clientes: ["Cliente", "Faturado", "Recebido", "Atrasado", "Data(s) de recebimento"],
    motoristas: ["Motorista", "A pagar", "Pago", "Atrasado", "Data(s) de pagamento"],
    placas: ["Placa", "Receita", "Diesel/Arla", "Manutenção", "Outras despesas", "Resultado"],
    despesas: ["Data", "Categoria", "Descrição", "Valor", "Pagamento"],
    agenda: ["Data", "Recebo", "Pago", "Saldo do dia"],
  };
  const nome = `quinzena-${q}-${mes}`;
  const titulo = `Relatório da ${per.label} (${dt(per.de)} a ${dt(per.ate)})`;

  return (
    <div className="space-y-4">
      <Card className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Mês"><Input type="month" className="h-9" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} /></Field>
        <Field label="Quinzena">
          <Select value={String(q)} onValueChange={(v) => setQ(Number(v) as 1 | 2)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1ª quinzena (1 a 15)</SelectItem>
              <SelectItem value="2">2ª quinzena (16 ao fim)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Clientes"><MultiSelect opcoes={data?.clientes ?? []} value={clienteIds} onChange={setClienteIds} vazioLabel="Todos os clientes" /></Field>
        <Field label="Placas"><MultiSelect opcoes={(data?.veiculos ?? []).map((v) => ({ id: v.id, nome: v.label }))} value={veiculoIds} onChange={setVeiculoIds} vazioLabel="Todas as placas" /></Field>
        <Field label="Motoristas"><MultiSelect opcoes={data?.motoristas ?? []} value={motoristaIds} onChange={setMotoristaIds} vazioLabel="Todos os motoristas" /></Field>
      </Card>

      {isLoading || !r || !tabelas ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Carregando…</Card>
      ) : (
        <>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => exportarExcel(nome, (Object.keys(C) as (keyof typeof C)[]).map((k) => ({ nome: k, colunas: C[k], linhas: tabelas[k] })))}>
              <FileSpreadsheet className="mr-1 size-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportarPdf({
              nomeArquivo: nome, titulo,
              kpis: [["Entradas", brl(r.entradas)], ["Saídas", brl(r.saidas)], ["Resultado", brl(r.resultado)], ["Margem", pct(r.margem)], ["Recebido", brl(r.recebido)], ["Pago", brl(r.pago)]],
              secoes: [
                { titulo: "Entradas por cliente", colunas: C.clientes, linhas: tabelas.clientes },
                { titulo: "Saídas por motorista", colunas: C.motoristas, linhas: tabelas.motoristas },
                { titulo: "Por placa", colunas: C.placas, linhas: tabelas.placas },
                { titulo: "Todas as despesas", colunas: C.despesas, linhas: tabelas.despesas },
                { titulo: "Agenda de recebimentos e pagamentos", colunas: C.agenda, linhas: tabelas.agenda },
              ],
            })}>
              <FileDown className="mr-1 size-4" /> PDF
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard label="Entradas" value={brl(r.entradas)} tone="brand" />
            <KpiCard label="Saídas" value={brl(r.saidas)} />
            <KpiCard label="Resultado" value={brl(r.resultado)} tone={r.resultado < 0 ? "danger" : "success"} sub={`Margem ${pct(r.margem)}`} />
            <KpiCard label="Já recebido" value={brl(r.recebido)} sub={`Falta ${brl(r.entradas - r.recebido)}`} />
            <KpiCard label="Já pago" value={brl(r.pago)} sub={`Falta ${brl(r.saidas - r.pago)}`} />
            <KpiCard label="Período" value={per.label} sub={`${dt(per.de)} a ${dt(per.ate)}`} />
          </div>
          <Tabela titulo="Agenda: quando recebo e quando pago" colunas={C.agenda} linhas={tabelas.agenda} />
          <Tabela titulo="Entradas por cliente" colunas={[...C.clientes, "Prazo"]} linhas={r.porCliente.map((g, i) => {
            const id = data!.clientes.find((c) => c.nome === g.nome)?.id;
            const rg = id ? regras?.cli.get(id) : undefined;
            return [...tabelas.clientes[i], prazoLabel(rg?.prazo_pagamento, rg?.prazo_dias)];
          })} />
          <Tabela titulo="Saídas por motorista" colunas={C.motoristas} linhas={tabelas.motoristas} />
          <Tabela titulo="Por placa" colunas={C.placas} linhas={tabelas.placas} />
          <Tabela titulo="Todas as despesas e saídas" colunas={[...C.despesas, "Situação"]} linhas={r.despesas.map((l, i) => {
            const s = situacao(l, hoje);
            return [...tabelas.despesas[i], <Badge key="s" variant={s.tone}>{s.txt}</Badge>];
          })} />
        </>
      )}
    </div>
  );
}
