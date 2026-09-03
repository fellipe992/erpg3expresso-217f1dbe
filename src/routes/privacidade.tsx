import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — G3 Expresso Motorista" },
      {
        name: "description",
        content:
          "Como o aplicativo G3 Expresso Motorista coleta, usa e protege dados de localização e informações pessoais.",
      },
      { property: "og:title", content: "Política de Privacidade — G3 Expresso Motorista" },
      {
        property: "og:description",
        content:
          "Como o aplicativo G3 Expresso Motorista coleta, usa e protege dados de localização e informações pessoais.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://erpg3expresso.lovable.app/privacidade" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "index, follow" },
    ],
    links: [{ rel: "canonical", href: "https://erpg3expresso.lovable.app/privacidade" }],
  }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 text-foreground">
      <h1 className="font-display text-2xl font-bold sm:text-3xl">
        Política de Privacidade — G3 Expresso
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Última atualização: 3 de setembro de 2026</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed">
        <p>
          A <strong>G3 Expresso</strong> valoriza a sua privacidade e compromete-se com a
          transparência e segurança no tratamento dos seus dados pessoais. Esta Política de
          Privacidade explica como suas informações são coletadas, usadas e protegidas pelo
          aplicativo <strong>G3 Expresso Motorista</strong>.
        </p>

        <section>
          <h2 className="text-lg font-semibold">
            1. Coleta de dados de localização em segundo plano
          </h2>
          <p className="mt-2">
            O aplicativo coleta dados de localização precisa (latitude e longitude) para permitir o
            rastreamento logístico contínuo durante o transporte de cargas e a execução de viagens
            de entrega.
          </p>
          <p className="mt-2">
            <strong>Aviso importante:</strong> a localização do dispositivo é coletada em segundo
            plano (mesmo com a tela desligada ou o app fechado) <em>somente</em> enquanto houver uma
            viagem ativa em andamento. O rastreamento é pausado ou encerrado automaticamente quando
            a viagem é concluída pelo motorista.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">2. Uso das informações</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Monitoramento do progresso da rota logística e do status de entregas pela equipe
              operacional da G3 Expresso;
            </li>
            <li>Registro de histórico de viagens, quilometragem e velocidades operacionais;</li>
            <li>Prevenção de falhas e reenvio offline de dados de telemetria.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">3. Compartilhamento e armazenamento</h2>
          <p className="mt-2">
            Não vendemos nem compartilhamos dados pessoais com terceiros para fins de marketing. Os
            dados são armazenados com segurança em banco de dados criptografado e são acessíveis
            apenas por usuários e administradores autorizados do sistema G3 Expresso.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">4. Permissões solicitadas</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Localização (GPS):</strong> registrar coordenadas durante as rotas
              operacionais.
            </li>
            <li>
              <strong>Notificações / serviço em primeiro plano:</strong> manter o motorista ciente
              de que o rastreamento da viagem está em execução.
            </li>
            <li>
              <strong>Câmera e fotos:</strong> anexar comprovantes de entrega, abastecimentos e
              manutenções.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">5. Contato</h2>
          <p className="mt-2">
            Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento de seus
            dados pessoais, entre em contato pelo e-mail oficial de suporte da empresa.
          </p>
        </section>
      </div>
    </main>
  );
}
