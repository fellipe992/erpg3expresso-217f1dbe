import { createFileRoute } from "@tanstack/react-router";
import { LancamentosPage } from "@/components/financeiro/lancamentos-page";

export const Route = createFileRoute("/_authenticated/app/pagar")({
  head: () => ({ meta: [{ title: "Contas a Pagar — G3 Expresso" }] }),
  component: () => <LancamentosPage tipo="pagar" />,
});
