# Notas por veículo e dimensionamento de frota no Roteirizador

Nada do que já existe muda de comportamento: os campos novos começam vazios ou desligados, e enquanto ficarem assim as rotas saem exatamente como hoje.

## O que você vai ver

**1. Em "Frota e Custos", dentro de cada veículo (Fiorino, Van, HR, VUC...)**
- Campo novo: **"Máx. de notas por veículo"**. Vazio = sem limite (como hoje).
- O resumo de cada veículo passa a mostrar também "até X notas" quando o campo estiver preenchido.

**2. No quadro "Otimização"**
- Chave nova: **"Modo cotação (frota ilimitada)"**. Ligada, o sistema ignora o campo "Disponíveis" e usa quantos veículos forem necessários. Assim dá para saber o tamanho real da operação, sem entregas ficando de fora por falta de carro.
- A "Ocupação mínima de peso" continua como está.

**3. Depois de roteirizar, um quadro novo: "Dimensionamento da frota"**
- Para cada tipo de veículo: quantidade necessária, notas por veículo (média e máxima), peso médio e ocupação média.
- Exemplo: "Fiorino: 3 veículos, 18 notas cada, 71% de ocupação; Van: 2 veículos, 25 notas cada, 64% de ocupação".
- Totais da operação: veículos, notas, peso e custo estimado.
- Mostra o motivo que mais limitou cada veículo, **peso** ou **quantidade de notas**, para você saber se o gargalo é a carga ou o número de entregas.
- Aparece em todos os cenários (menor custo, menor tempo etc.) e entra na exportação.

## Como o sistema calcula
- Cada veículo é carregado até bater o primeiro limite: peso, m³ (se a cubagem estiver ligada) ou máximo de notas.
- Entre Fiorino e Van, ele escolhe o que fica mais barato por kg naquela rota, como já faz hoje. Fiorino só entra se estiver com quantidade maior que zero (ou com o Modo cotação ligado).
- Cada linha da planilha conta como uma nota.

## Detalhes técnicos
- O tipo `PerfilVeiculo.maxEntregas` já existe e o otimizador já respeita esse campo (`otimizador.ts` e `cenarios.ts`). Falta só ele aparecer na tela: um input no `frota-panel.tsx`, em que vazio ou 0 grava `undefined`.
- Adicionar `modoCotacao: boolean` (padrão `false`) em `OpcoesOtimizacao` e `OPCOES_OTIMIZACAO_PADRAO`. Em `gerarCenario`, quando estiver ligado, tratar `disponiveis` como ilimitado (filtro de frota e `escolherParaLote`). O mesmo vale para `otimizador.ts`.
- Novo componente `src/components/roteirizador/dimensionamento-frota.tsx`, que agrupa `cenario.rotas` por `veiculo.categoria`. O limitante de cada rota é "notas" quando `paradas.length >= maxEntregas`; caso contrário é "peso". O componente é exibido junto ao resumo dos cenários em `roteirizador.tsx`, e uma aba ou bloco extra entra em `exportar.ts`.
- Teste com vitest para o limite de notas: 30 entregas leves com máx. de 10 notas resultam em 3 veículos. Outro teste para o modo cotação: 0 disponíveis e modo ligado continua atendendo todas as entregas.
- Não há mudança no banco de dados. Projetos salvos que não têm os campos novos usam os padrões.
