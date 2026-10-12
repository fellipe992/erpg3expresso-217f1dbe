import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/crm/metricas-conversao")({
  head: () => ({
    meta: [
      { title: "Métricas de conversão | G3 Expresso" },
      { name: "description", content: "Abordagens enviadas, respostas, conversões e taxa de conversão por mês." },
      { property: "og:title", content: "Métricas de conversão | G3 Expresso" },
      { property: "og:description", content: "Conversão comercial do Hunter mês a mês." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const mesDe = (s: string) => new Date(s).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

function Page() {
  const q = useQuery({
    queryKey: ["metricas-conversao"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hunter_abordagens")
        .select("created_at, enviado_em, status, resposta_cliente").limit(5000);
      if (error) throw error;
      return data;
    },
  });
  const meses = new Map<string, { geradas: number; enviadas: number; respostas: number; conversoes: number }>();
  for (const r of q.data ?? []) {
    const m = mesDe(r.enviado_em ?? r.created_at);
    const x = meses.get(m) ?? { geradas: 0, enviadas: 0, respostas: 0, conversoes: 0 };
    x.geradas++;
    if (r.enviado_em) x.enviadas++;
    if (r.resposta_cliente || r.status === "resposta_pendente" || r.status === "convertido") x.respostas++;
    if (r.status === "convertido") x.conversoes++;
    meses.set(m, x);
  }
  const linhas = [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const tot = linhas.reduce((t, [, x]) => ({ enviadas: t.enviadas + x.enviadas, respostas: t.respostas + x.respostas, conversoes: t.conversoes + x.conversoes }), { enviadas: 0, respostas: 0, conversoes: 0 });
  const nomeMes = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div><h1 className="text-2xl font-bold">Métricas de conversão</h1>
        <p className="text-sm text-muted-foreground">Todos os comerciais. O mês considera a data de envio (ou de criação, se não enviada).</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Enviadas", tot.enviadas], ["Respostas", tot.respostas], ["Conversões", tot.conversoes],
          ["Taxa de resposta", pct(tot.respostas, tot.enviadas)], ["Taxa de conversão", pct(tot.conversoes, tot.enviadas)]].map(([t, v]) => (
          <Card key={t as string}><CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{t}</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{v}</p></CardContent></Card>
        ))}
      </div>
      {q.isLoading && <Loader2 className="size-5 animate-spin" />}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-2">Mês</th><th className="p-2 text-right">Geradas</th><th className="p-2 text-right">Enviadas</th><th className="p-2 text-right">Respostas</th>
              <th className="p-2 text-right">Conversões</th><th className="p-2 text-right">Taxa de resposta</th><th className="p-2 text-right">Taxa de conversão</th></tr>
          </thead>
          <tbody>
            {linhas.map(([m, x]) => (
              <tr key={m} className="border-t">
                <td className="p-2 capitalize">{nomeMes(m)}</td>
                <td className="p-2 text-right">{x.geradas}</td><td className="p-2 text-right">{x.enviadas}</td>
                <td className="p-2 text-right">{x.respostas}</td><td className="p-2 text-right">{x.conversoes}</td>
                <td className="p-2 text-right">{pct(x.respostas, x.enviadas)}</td>
                <td className="p-2 text-right font-semibold">{pct(x.conversoes, x.enviadas)}</td>
              </tr>
            ))}
            {!q.isLoading && linhas.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Sem dados ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
