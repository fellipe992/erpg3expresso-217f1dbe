import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DemonstrativoViagem, calcularProvisao, num } from "@/components/viagem/demonstrativo-viagem";

export const Route = createFileRoute("/_authenticated/app/simulador")({
  head: () => ({
    meta: [
      { title: "Simulador de viagem — G3 Expresso" },
      { name: "description", content: "Simule receita, custos e provisionamentos por km para calcular o lucro da viagem." },
      { property: "og:title", content: "Simulador de viagem — G3 Expresso" },
      { property: "og:description", content: "Simule receita, custos e provisionamentos por km para calcular o lucro da viagem." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SimuladorPage,
});

function SimuladorPage() {
  const { role } = useAuth();
  const isStaff = role === "administrador" || role === "gestor" || role === "financeiro";

  const [veiculoId, setVeiculoId] = useState<string>("__none");
  const [km, setKm] = useState("");
  const [receita, setReceita] = useState("");
  const [combustivel, setCombustivel] = useState("");
  const [pedagio, setPedagio] = useState("");
  const [comissao, setComissao] = useState("");
  const [outros, setOutros] = useState("");
  const [manutKm, setManutKm] = useState("");
  const [pneusKm, setPneusKm] = useState("");

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-provisao"],
    enabled: isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("veiculos")
        .select("id, placa, modelo, provisao_manutencao_km, provisao_pneus_km")
        .eq("ativo", true)
        .order("placa");
      return data ?? [];
    },
  });

  useEffect(() => {
    const v = veiculos.find((x: any) => x.id === veiculoId) as any;
    if (!v) return;
    setManutKm(v.provisao_manutencao_km ? String(v.provisao_manutencao_km) : "");
    setPneusKm(v.provisao_pneus_km ? String(v.provisao_pneus_km) : "");
  }, [veiculoId, veiculos]);

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-8 text-center text-sm text-muted-foreground">Acesso restrito.</Card>
      </div>
    );
  }

  const kmNum = num(km) || null;
  const custos = {
    receita: num(receita),
    combustivel: num(combustivel),
    pedagio: num(pedagio),
    comissao: num(comissao),
    provisaoManutencao: calcularProvisao(kmNum, manutKm),
    provisaoPneus: calcularProvisao(kmNum, pneusKm),
    outros: num(outros),
    km: kmNum,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <Calculator className="size-6 text-brand" />
        <div>
          <h1 className="font-display text-xl font-bold md:text-2xl">Simulador de viagem</h1>
          <p className="text-xs text-muted-foreground">Planeje receita, custos e provisionamentos por km. Não altera dados reais.</p>
        </div>
      </div>

      <Card className="space-y-4 p-4 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Veículo (carrega provisões padrão)">
            <Select value={veiculoId} onValueChange={setVeiculoId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem veículo</SelectItem>
                {veiculos.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.placa} · {v.modelo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Distância da rota (km)">
            <Input type="number" step="1" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Ex.: 850" />
          </Field>
          <Field label="Receita bruta (R$)">
            <Input type="number" step="0.01" value={receita} onChange={(e) => setReceita(e.target.value)} />
          </Field>
          <Field label="Combustível (R$)">
            <Input type="number" step="0.01" value={combustivel} onChange={(e) => setCombustivel(e.target.value)} />
          </Field>
          <Field label="Pedágios (R$)">
            <Input type="number" step="0.01" value={pedagio} onChange={(e) => setPedagio(e.target.value)} />
          </Field>
          <Field label="Comissão do motorista (R$)">
            <Input type="number" step="0.01" value={comissao} onChange={(e) => setComissao(e.target.value)} />
          </Field>
          <Field label="Outros custos (R$)">
            <Input type="number" step="0.01" value={outros} onChange={(e) => setOutros(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <div>
            <p className="text-sm font-semibold">Provisionamentos operacionais</p>
            <p className="text-xs text-muted-foreground">
              Opcionais. Em branco ou zero não entram no cálculo. Distância × valor por km.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Manutenção (R$/km)">
              <Input type="number" step="0.01" placeholder="Ex.: 0,60" value={manutKm} onChange={(e) => setManutKm(e.target.value)} />
            </Field>
            <Field label="Pneus (R$/km)">
              <Input type="number" step="0.01" placeholder="Ex.: 0,15" value={pneusKm} onChange={(e) => setPneusKm(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <h2 className="font-display text-lg font-bold">Demonstrativo financeiro</h2>
      <DemonstrativoViagem custos={custos} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
