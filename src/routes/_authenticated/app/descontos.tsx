import { createFileRoute } from "@tanstack/react-router";
import { LancamentosMotoristaPage } from "@/components/lancamentos/lancamentos-motorista";

export const Route = createFileRoute("/_authenticated/app/descontos")({
  head: () => ({ meta: [{ title: "Descontos e antecipações — G3 Expresso" }, { name: "description", content: "Antecipações e descontos dos motoristas, aplicados no fechamento." }] }),
  component: () => <LancamentosMotoristaPage modo="antecipacao" />,
});
