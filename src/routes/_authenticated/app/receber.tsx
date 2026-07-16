import { createFileRoute } from "@tanstack/react-router";
import { LancamentosPage } from "@/components/financeiro/lancamentos-page";

export const Route = createFileRoute("/_authenticated/app/receber")({
  head: () => ({ meta: [{ title: "Contas a Receber — G3 Expresso" }] }),
  component: () => <LancamentosPage tipo="receber" />,
});
