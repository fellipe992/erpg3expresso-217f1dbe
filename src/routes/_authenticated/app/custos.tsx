import { createFileRoute, Link } from "@tanstack/react-router";
import { Fuel, Wrench, Receipt, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/custos")({
  head: () => ({ meta: [{ title: "Custos da viagem — G3 Expresso" }] }),
  component: CustosPage,
});

const itens = [
  { to: "/app/abastecimentos", icon: Fuel, titulo: "Abastecimento", desc: "Diesel, Arla e outros combustíveis na mesma nota" },
  { to: "/app/manutencoes", icon: Wrench, titulo: "Manutenção", desc: "Serviços, peças e revisões do veículo" },
  { to: "/app/despesas", icon: Receipt, titulo: "Despesas operacionais", desc: "Hotel, alimentação, pedágio e afins" },
];

function CustosPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Custos</h1>
        <p className="text-sm text-muted-foreground">Registre os gastos da viagem — eles ficam vinculados ao seu veículo.</p>
      </div>

      <div className="space-y-3">
        {itens.map((i) => {
          const Icon = i.icon;
          return (
            <Link key={i.to} to={i.to as never} className="block">
              <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-accent/40">
                <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-subtle">
                  <Icon className="size-5 text-brand" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{i.titulo}</div>
                  <p className="text-xs text-muted-foreground">{i.desc}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
