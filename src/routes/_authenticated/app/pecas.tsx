import { createFileRoute } from "@tanstack/react-router";
import { LancamentosMotoristaPage } from "@/components/lancamentos/lancamentos-motorista";

export const Route = createFileRoute("/_authenticated/app/pecas")({
  head: () => ({ meta: [{ title: "Peças — G3 Expresso" }, { name: "description", content: "Lançamento de peças compradas para a frota e agregados." }] }),
  component: () => <LancamentosMotoristaPage modo="peca" />,
});
