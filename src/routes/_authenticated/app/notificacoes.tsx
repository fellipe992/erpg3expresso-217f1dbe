import { createFileRoute } from "@tanstack/react-router";
import { NotificacoesCentral } from "@/components/notificacoes/notificacoes-central";

export const Route = createFileRoute("/_authenticated/app/notificacoes")({
  head: () => ({
    meta: [
      { title: "Central de Notificações — G3 Expresso" },
      {
        name: "description",
        content:
          "Central de notificações do ERP G3 Expresso: viagens, monitoramento, documentos, manutenções e financeiro.",
      },
      { property: "og:title", content: "Central de Notificações — G3 Expresso" },
      {
        property: "og:description",
        content: "Acompanhe alertas de viagens, documentos, manutenções e financeiro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificacoesCentral,
});
