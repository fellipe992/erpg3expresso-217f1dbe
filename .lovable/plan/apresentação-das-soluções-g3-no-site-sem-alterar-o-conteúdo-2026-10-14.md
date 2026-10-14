# Apresentação das soluções G3 no site, sem alterar o conteúdo atual

## Resultado
Acrescentar uma vitrine de soluções ao **G3 Expresso Hub**, preservando textos, imagens, menu, formulários, links e seções existentes. Nenhuma alteração no ERP neste trabalho.

O site já possui a seção **Tecnologia e Gestão**. A proposta é acrescentar a vitrine ao final dessa seção, antes de “Nossos valores”, sem substituir o conteúdo atual.

## Como o visitante verá

**Título:** Soluções G3 Expresso para clientes e parceiros.

**Introdução:** Mais visibilidade para sua carga, organização para suas entregas e informação para negociar cada viagem.

Três demonstrações, com cenas geradas por IA de operações logísticas e exemplos fiéis das ferramentas. As cenas dão contexto; as telas demonstrativas mostram o funcionamento. Não pedir à IA que invente telas, textos, cálculos ou alertas do sistema.

### 1. Monitoramento e zonas de risco
- Cena de um caminhão em deslocamento, sem pessoas identificáveis ou placas legíveis.
- Demonstração fictícia: veículo “DEMO 01” avançando no mapa; zonas verdes, amarelas, laranjas e vermelhas; aviso de aproximação de área de atenção; solicitação de acompanhamento pelo motorista.
- **Mensagem:** “Visibilidade da viagem e atenção aos trechos que exigem mais cuidado.”
- Explicar que as zonas são referências sujeitas à atualização e validação, não garantia de segurança ou cobertura completa de todos os bairros. O rastreamento depende do GPS e da conexão.
- **Ação:** “Conhecer o monitoramento”, usando o contato comercial já existente.

### 2. Roteirizador inteligente para clientes
- Cena de distribuição e carregamento com volumes sem marcas reais.
- Demonstração fictícia: cadastrar entregas, ordenar paradas, comparar trajetos e salvar o plano para a equipe G3 distribuir aos motoristas.
- **Mensagem:** “Organize suas entregas com o roteirizador G3. Acesso gratuito para clientes, mediante liberação da equipe.”
- Gratuidade é a oferta definida por você; não prometer cadastro público, liberação automática ou acesso do cliente ao despacho de motoristas.
- **Ação:** “Solicitar acesso gratuito”, abrindo o contato comercial existente com mensagem específica.

### 3. Planejamento de viagens para parceiros com carreta
- Cena de carreta e preparação de viagem, sem reproduzir motoristas reais.
- Demonstração fictícia: distância, eixos, consumo e diesel; combustível, pedágios, manutenção, pneus e outros custos; frete informado e margem estimada.
- **Mensagem:** “Antes de aceitar o frete, conheça os custos estimados da viagem.”
- Mostrar comparação entre rota eficiente e alternativa de menor risco, quando disponível, conforme o tipo de carga.
- Não prometer ausência de prejuízo, lucro garantido ou valores de mercado comprovados. Alternativas podem não estar disponíveis em viagens com paradas intermediárias.
- **Ação:** “Quero ser parceiro”, usando a página `/parceiros` existente.
- **Limitação verificada:** o planejador atual está restrito à equipe interna. Apresentar como apoio da G3 ao parceiro; acesso direto pelo parceiro exige um trabalho separado no ERP.

## Produção e privacidade
- Estilo escolhido: **cenas geradas por IA**, com complementos demonstrativos fiéis e sintéticos.
- Começar por um piloto de monitoramento para aprovar linguagem e acabamento antes de produzir os outros dois.
- Aprovar referências visuais, roteiro e imagens iniciais antes de gerar os vídeos. Este plano é da integração no site, não substitui essas aprovações de produção.
- Planejar peças curtas de aproximadamente 15–25 segundos; informar a duração real após a geração.
- Manter a identificação **“Demonstração com dados fictícios”** nas telas. Não apresentar exemplos como resultados da G3.
- Não consultar nem filmar dados de produção. Não utilizar nomes, fotos, contatos, placas, cargas, posições, valores, margens ou históricos reais. Não basta desfocar uma captura real: criar a demonstração do zero com dados sintéticos.
- Usar MP4 como formato principal, com imagem de capa. GIF é opcional, apenas se houver necessidade: pesa mais e tem menos controles.
- A geração de mídia pode consumir saldo de uso. Não inventar custo por vídeo; consultar a estimativa disponível antes da produção. Assistir às peças prontas não gera uma nova chamada de IA, embora haja hospedagem e tráfego.

## Detalhes técnicos para o projeto do site
- Reutilizar os componentes e os tokens de identidade já presentes; não redesenhar o site nem adicionar uma segunda identidade visual.
- Manter as três peças legíveis no celular, sem rolagem horizontal. Vídeos com controles, sem som automático, capa e carregamento sob demanda; respeitar movimento reduzido.
- Criar os exemplos com dados locais estáticos, sem conexão ao banco do ERP, chaves ou chamadas reais do Google. Mapas ilustrativos devem ser identificados como demonstração; se um mapa real for usado, preservar sua atribuição e termos.
- Gerar e armazenar mídia no próprio G3 Expresso Hub; não copiar ponteiros de mídia deste ERP para o site.
- Verificar se a entrega usada é o site Lovable ou o pacote `static-site`; atualizar apenas os acréscimos correspondentes à entrega ativa, sem presumir qual está publicado.
- Conferir as três ações, reprodução, legibilidade e ausência de dados reais no computador e no celular. Não publicar sem solicitação.

## Prompt pronto para colar no G3 Expresso Hub

```text
Quero ACRESCENTAR uma apresentação das soluções da G3 Expresso neste site. Não substitua nem reescreva conteúdo existente e não altere o menu, a abertura da página, imagens atuais, formulários, contatos, links ou seções. Não modifique o ERP.

Primeiro leia a estrutura atual. Acrescente ao final da seção “Tecnologia e Gestão”, antes de “Nossos valores”, uma área intitulada “Soluções G3 Expresso para clientes e parceiros”. Reutilize a identidade visual e os componentes existentes. Introdução: “Mais visibilidade para sua carga, organização para suas entregas e informação para negociar cada viagem.”

Apresente três soluções com comunicação humana, objetiva e orientada ao benefício, usando cenas geradas por IA de caminhões e operações logísticas e demonstrações fiéis das ferramentas com dados inteiramente fictícios. Não use vídeos genéricos como única demonstração: cada peça precisa mostrar a sequência da ferramenta. Não peça à IA de vídeo que invente a interface, números, texto ou cálculos. Combine as cenas de contexto com telas sintéticas legíveis que representem as funcionalidades descritas abaixo.

1. MONITORAMENTO E ZONAS DE RISCO
Mensagem: “Visibilidade da viagem e atenção aos trechos que exigem mais cuidado.” Mostrar um veículo identificado apenas como “DEMO 01” avançando em um mapa demonstrativo; zonas verde, amarelo, laranja e vermelho; aviso de aproximação de uma área de atenção e solicitação de monitoramento pelo motorista. As zonas são referências atualizáveis, não garantia de segurança ou cobertura completa. Rastreamento depende de GPS e conexão. Ação: “Conhecer o monitoramento”, usando o contato comercial já existente.

2. ROTEIRIZADOR INTELIGENTE
Mensagem: “Organize suas entregas com o roteirizador G3. Acesso gratuito para clientes, mediante liberação da equipe.” Mostrar entregas fictícias, ordenação de paradas, comparação de trajetos e plano salvo para distribuição pela equipe G3. O cliente pode planejar; não demonstrar atribuição ou despacho de motoristas pelo cliente. Não prometer acesso automático nem criar cadastro público. Ação: “Solicitar acesso gratuito”, usando o contato comercial existente com uma mensagem específica sobre o roteirizador.

3. PLANEJAMENTO DE VIAGENS PARA PARCEIROS COM CARRETA
Mensagem: “Antes de aceitar o frete, conheça os custos estimados da viagem.” Mostrar distância, eixos, consumo, preço do diesel, combustível, pedágios, manutenção, pneus, outros custos, valor do frete e margem estimada com contas coerentes e valores fictícios. Mostrar a comparação entre rota eficiente e alternativa de menor risco conforme a carga, quando disponível. Não garantir lucro ou ausência de prejuízo. O planejador atual é usado pela equipe G3: divulgue como apoio ao parceiro, sem prometer login direto dele. Ação: “Quero ser parceiro”, levando à página /parceiros já existente.

PRIVACIDADE OBRIGATÓRIA
Criar exemplos do zero com dados locais sintéticos. Não consultar ou conectar o banco do ERP. Não usar capturas de produção, mesmo desfocadas. Nunca mostrar motoristas ou clientes reais, placas, contatos, posições reais de veículos, documentos, resultados, custos, margens ou históricos da G3. Identificar as telas: “Demonstração com dados fictícios”. Pessoas geradas não devem representar colaboradores reais. Zonas e percursos demonstrativos não devem ser apresentados como dados oficiais de criminalidade.

PRODUÇÃO
Use o fluxo de vídeo publicitário com cenas geradas por IA. Comece com um piloto do monitoramento. Apresente referências visuais e peça aprovação; depois apresente roteiro e peça aprovação; depois apresente imagens iniciais e peça aprovação; somente então gere os clipes. Planeje vídeos curtos, aproximadamente 15–25 segundos. Informe qualquer estimativa de consumo disponível antes de gerar; não invente preço. Não produza os três de uma vez antes da aprovação do piloto. Não inclua apresentador falante; as peças devem ser compreensíveis sem áudio.

ENTREGA NO SITE
Prefira MP4 com capa e controles, sem som automático, carregamento sob demanda e boa legibilidade no celular, sem rolagem horizontal. Respeite preferências de movimento reduzido. Gere e registre os arquivos de mídia neste projeto, sem reutilizar ponteiros de mídia de outro projeto. Não instale uma IA que gere vídeos a cada visita. Se houver versão static-site, confirme qual entrega está ativa antes de decidir quais acréscimos atualizar. Preserve toda a estrutura atual. Teste vídeos, ações e apresentação no computador e no celular. Não publique sem meu pedido explícito.

Comece apresentando a proposta do acréscimo e as referências do piloto. Não gere vídeos nem altere o site antes das aprovações necessárias.
```

## Escopo desta etapa
Entregar a proposta e o prompt para execução no **G3 Expresso Hub**. Nenhum vídeo foi gerado e nenhum dos dois projetos foi alterado nesta etapa de planejamento.