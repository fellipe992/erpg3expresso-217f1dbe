import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/crud/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, dt } from "@/lib/export-utils";

export const Route = createFileRoute("/_authenticated/app/pagamentos-clientes")({
  head: () => ({ meta: [{ title: "Pagamentos por cliente — G3 Expresso" }] }),
  component: PagamentosClientes,
});

type Lanc = {
  id: string;
  descricao: string | null;
  valor: number;
  data_vencimento: string | null;
  status: string;
  numero_documento: string | null;
  cliente_id: string | null;
  cliente: { razao_social: string | null } | null;
};

const hojeSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function diasEntre(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86400000);
}

function PagamentosClientes() {
  const [busca, setBusca] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["pagamentos-clientes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro_lancamentos")
        .select("id, descricao, valor, data_vencimento, status, numero_documento, cliente_id, cliente:clientes(razao_social)")
        .eq("tipo", "receber")
        .in("status", ["pendente", "atrasado"])
        .order("data_vencimento", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Lanc[];
    },
  });

  const hoje = hojeSP();
  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const m = new Map<string, { nome: string; itens: Lanc[]; total: number; vencido: number }>();
    for (const l of data ?? []) {
      const nome = l.cliente?.razao_social ?? "SEM CLIENTE";
      if (q && !nome.toLowerCase().includes(q) && !(l.numero_documento ?? "").toLowerCase().includes(q)) continue;
      const k = l.cliente_id ?? "-";
      const g = m.get(k) ?? { nome, itens: [], total: 0, vencido: 0 };
      g.itens.push(l);
      g.total += Number(l.valor);
      if (l.data_vencimento && l.data_vencimento < hoje) g.vencido += Number(l.valor);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [data, busca, hoje]);

  const total = grupos.reduce((s, g) => s + g.total, 0);
  const vencido = grupos.reduce((s, g) => s + g.vencido, 0);

  return (
    <PageShell
      icon={Users}
      title="Pagamentos por cliente"
      subtitle="Quanto cada cliente deve e a data de vencimento real de cada conta"
      search={busca}
      onSearch={setBusca}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total em aberto</div><div className="font-mono text-lg font-bold">{brl(total)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Vencido</div><div className="font-mono text-lg font-bold text-destructive">{brl(vencido)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Clientes devendo</div><div className="font-mono text-lg font-bold">{grupos.length}</div></Card>
      </div>

      {isLoading ? (
        <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
      ) : grupos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum valor em aberto.</Card>
      ) : (
        grupos.map((g) => (
          <Card key={g.nome} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
              <div className="font-display font-bold">{g.nome}</div>
              <div className="flex gap-4 text-sm">
                {g.vencido > 0 && <span className="text-destructive">Vencido {brl(g.vencido)}</span>}
                <span className="font-mono font-semibold">Deve {brl(g.total)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2">Vencimento</th>
                    <th className="px-4 py-2">Documento</th>
                    <th className="px-4 py-2">Descrição</th>
                    <th className="px-4 py-2">Situação</th>
                    <th className="px-4 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {g.itens.map((l) => {
                    const d = l.data_vencimento;
                    const dias = d ? diasEntre(hoje, d) : null;
                    return (
                      <tr key={l.id} className="border-t border-border/40">
                        <td className="px-4 py-2 font-mono font-semibold">{d ? dt(d) : "SEM VENCIMENTO"}</td>
                        <td className="px-4 py-2">{l.numero_documento ?? "—"}</td>
                        <td className="px-4 py-2">{l.descricao ?? "—"}</td>
                        <td className="px-4 py-2">
                          {dias === null ? (
                            <Badge variant="outline">Sem data</Badge>
                          ) : dias < 0 ? (
                            <Badge variant="destructive">{-dias} dia(s) em atraso</Badge>
                          ) : dias === 0 ? (
                            <Badge>Vence hoje</Badge>
                          ) : (
                            <Badge variant="secondary">Vence em {dias} dia(s)</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">{brl(Number(l.valor))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </PageShell>
  );
}
