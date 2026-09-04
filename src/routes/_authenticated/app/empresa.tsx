import { createFileRoute, redirect } from "@tanstack/react-router";
import { Building2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/crud/page-shell";
import { EmpresasCadastro } from "@/components/fiscal/empresas-cadastro";

export const Route = createFileRoute("/_authenticated/app/empresa")({
  head: () => ({
    meta: [
      { title: "Empresas — G3 Expresso" },
      {
        name: "description",
        content: "Cadastro das empresas emitentes de CT-e e MDF-e da G3 Expresso, com busca automática por CNPJ.",
      },
      { property: "og:title", content: "Empresas — G3 Expresso" },
      { property: "og:description", content: "Cadastre suas empresas e escolha qual delas emite os documentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: EmpresaPage,
});

function EmpresaPage() {
  return (
    <PageShell
      icon={Building2}
      title="Empresas"
      subtitle="Cadastre suas empresas e escolha qual delas emite os documentos de transporte"
    >
      <EmpresasCadastro />
    </PageShell>
  );
}
