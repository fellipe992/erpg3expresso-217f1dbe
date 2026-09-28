import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download, Leaf, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Relatório ESG — emissões de CO₂ da frota.
 * Fonte: abastecimentos (litros por combustível) + km rodados.
 * Fatores de emissão (kg CO₂ por litro), referência GHG Protocol / MCTI:
 *   Diesel (S10/S500): 2,68 | Gasolina: 2,31 | Etanol: 1,51 | GNV: 2,00 | Arla 32: 0 (não combustível fóssil de queima direta)
 */

const FATORES: Record<string, number> = {
  "diesel s10": 2.68,
  "diesel s500": 2.68,
  diesel: 2.68,
  gasolina: 2.31,
  etanol: 1.51,
  gnv: 2.0,
  "arla 32": 0,
  arla: 0,
};

const fatorDe = (combustivel: string | null) => FATORES[(combustivel ?? "diesel").trim().toLowerCase()] ?? 2.68;

type Abast = {
  id: string;
  data: string | null;
  litros: number | null;
  combustivel: string | null;
  km_percorridos: number | null;
  veiculo_id: string | null;
};

function quinzenaKey(iso: string) {
  const d = new Date(iso + "T12:00:00");
  const q = d.getDate() <= 15 ? 1 : 2;
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-Q${q}`, label: `${q}ª quinzena ${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` };
}

const fmtNum = (n: number, casas = 0) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export function RelatorioEsg() {
  const [meses, setMeses] = useState<3 | 6 | 12>(6);

  const desde = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - meses);
    return d.toISOString().slice(0, 10);
  }, [meses]);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-esg", desde],
    queryFn: async () => {
      const [abast, vei] = await Promise.all([
        supabase
          .from("abastecimentos")
          .select("id, data, litros, combustivel, km_percorridos, veiculo_id")
          .gte("data", desde),
        supabase.from("veiculos").select("id, placa, modelo"),
      ]);
      return {
        abastecimentos: (abast.data ?? []) as Abast[],
        veiculos: new Map(
          ((vei.data ?? []) as { id: string; placa: string; modelo: string | null }[]).map((v) => [
            v.id,
            `${v.placa}${v.modelo ? ` · ${v.modelo}` : ""}`,
          ]),
        ),
      };
    },
  });

  const calc = useMemo(() => {
    if (!data) return null;
    let litrosTotal = 0;
    let co2Total = 0;
    let kmTotal = 0;
    const porQuinzena = new Map<string, { label: string; co2: number; litros: number }>();
    const porVeiculo = new Map<string, { nome: string; co2: number; litros: number; km: number }>();

    for (const a of data.abastecimentos) {
      const litros = Number(a.litros ?? 0);
      if (litros <= 0 || !a.data) continue;
      const co2 = litros * fatorDe(a.combustivel);
      const km = Math.max(0, Number(a.km_percorridos ?? 0));
      litrosTotal += litros;
      co2Total += co2;
      kmTotal += km;

      const { key, label } = quinzenaKey(a.data);
      const q = porQuinzena.get(key) ?? { label, co2: 0, litros: 0 };
      q.co2 += co2;
      q.litros += litros;
      porQuinzena.set(key, q);

      if (a.veiculo_id) {
        const nome = data.veiculos.get(a.veiculo_id) ?? "—";
        const v = porVeiculo.get(a.veiculo_id) ?? { nome, co2: 0, litros: 0, km: 0 };
        v.co2 += co2;
        v.litros += litros;
        v.km += km;
        porVeiculo.set(a.veiculo_id, v);
      }
    }

    const quinzenas = Array.from(porQuinzena.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ name: v.label, co2: Math.round(v.co2), litros: Math.round(v.litros) }));

    const veiculos = Array.from(porVeiculo.values()).sort((a, b) => b.co2 - a.co2);

    return {
      litrosTotal,
      co2Total,
      kmTotal,
      quinzenas,
      veiculos,
      gPorKm: kmTotal > 0 ? (co2Total * 1000) / kmTotal : 0,
      arvores: co2Total / 1000 / 0.15, // ~150 kg CO₂/ano absorvidos por árvore adulta (referência comum)
    };
  }, [data]);

  const exportarCsv = () => {
    if (!calc) return;
    const linhas: (string | number)[][] = [
      ["Quinzena", "Litros", "CO2 (kg)"],
      ...calc.quinzenas.map((q) => [q.name, q.litros, q.co2]),
      [],
      ["Veiculo", "Litros", "Km", "CO2 (kg)", "g CO2/km"],
      ...calc.veiculos.map((v) => [
        v.nome,
        v.litros.toFixed(1),
        v.km.toFixed(0),
        v.co2.toFixed(1),
        v.km > 0 ? ((v.co2 * 1000) / v.km).toFixed(0) : "",
      ]),
    ];
    const csv = linhas.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `esg-co2-${meses}meses.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-lg bg-brand-subtle">
            <Leaf className="size-4 text-brand" />
          </div>
          <div>
            <h2 className="font-display font-bold">Pegada de carbono da frota</h2>
            <p className="text-xs text-muted-foreground">
              Emissões de CO₂ calculadas pelos litros abastecidos (fatores GHG Protocol)
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {([3, 6, 12] as const).map((m) => (
            <Button key={m} variant={meses === m ? "default" : "outline"} size="sm" onClick={() => setMeses(m)}>
              {m} meses
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={!calc}>
            <Download className="mr-2 size-4" /> CSV
          </Button>
        </div>
      </div>

      {isLoading || !calc ? (
        <div className="grid min-h-[30vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : calc.quinzenas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sem abastecimentos no período selecionado.
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">CO₂ emitido</div>
              <div className="mt-1 font-display text-xl font-bold text-brand">{fmtNum(calc.co2Total / 1000, 2)} t</div>
              <div className="text-xs text-muted-foreground">{fmtNum(calc.co2Total)} kg no período</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Combustível</div>
              <div className="mt-1 font-display text-xl font-bold">{fmtNum(calc.litrosTotal)} L</div>
              <div className="text-xs text-muted-foreground">diesel e outros combustíveis</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Intensidade</div>
              <div className="mt-1 font-display text-xl font-bold">{fmtNum(calc.gPorKm)} g/km</div>
              <div className="text-xs text-muted-foreground">de CO₂ por quilômetro rodado</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Equivalência</div>
              <div className="mt-1 font-display text-xl font-bold">{fmtNum(calc.arvores)} árvores</div>
              <div className="text-xs text-muted-foreground">para compensar as emissões em 1 ano</div>
            </Card>
          </div>

          <Card className="p-4 md:p-6">
            <h3 className="mb-4 font-display font-bold">Emissões por quinzena</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calc.quinzenas}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" height={56} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}t`} />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === "CO₂ (kg)" ? [`${fmtNum(v)} kg`, name] : [`${fmtNum(v)} L`, name]
                    }
                    contentStyle={{ borderRadius: 8, background: "var(--color-card)", border: "1px solid var(--color-border)" }}
                  />
                  <Legend />
                  <Bar dataKey="co2" name="CO₂ (kg)" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4 md:p-6">
            <h3 className="mb-4 font-display font-bold">Emissões por veículo</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Veículo</th>
                    <th className="py-2 text-right">Litros</th>
                    <th className="py-2 text-right">Km</th>
                    <th className="py-2 text-right">CO₂ (kg)</th>
                    <th className="py-2 text-right">g CO₂/km</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {calc.veiculos.map((v) => (
                    <tr key={v.nome}>
                      <td className="py-2">{v.nome}</td>
                      <td className="py-2 text-right font-mono">{fmtNum(v.litros, 1)}</td>
                      <td className="py-2 text-right font-mono">{fmtNum(v.km)}</td>
                      <td className="py-2 text-right font-mono">{fmtNum(v.co2)}</td>
                      <td className="py-2 text-right font-mono">
                        {v.km > 0 ? fmtNum((v.co2 * 1000) / v.km) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
