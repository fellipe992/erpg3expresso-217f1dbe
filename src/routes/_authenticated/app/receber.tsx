import { createFileRoute } from "@tanstack/react-router";
import { LancamentosPage } from "@/components/financeiro/lancamentos-page";

type Atalho = "hoje" | "atrasados" | undefined;

const validateSearch = (search: Record<string, unknown>): { atalho: Atalho } => ({
  atalho: search.atalho === "hoje" || search.atalho === "atrasados" ? search.atalho : undefined,
});

export const Route = createFileRoute("/_authenticated/app/receber")({
  validateSearch,
  head: () => ({ meta: [{ title: "Contas a Receber — G3 Expresso" }] }),
  component: PaginaReceber,
});

function PaginaReceber() {
  const { atalho } = Route.useSearch();
  return <LancamentosPage tipo="receber" atalhoInicial={atalho} />;
}
