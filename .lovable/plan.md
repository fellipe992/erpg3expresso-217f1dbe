# Relatórios e filtros por período de operação

Objetivo: todo filtro de período passar a entender duas leituras diferentes — o período em que a operação aconteceu (as viagens) e o período em que o dinheiro entra ou sai (vencimento/pagamento) — sem alterar valores nem registros já existentes.

## O que muda na prática

### 1. Contas a pagar e Contas a receber
- O seletor de período passa a ter estas bases, com nomes claros:
  - **Vencimento** (padrão, como você pediu)
  - **Pagamento/recebimento realizado**
  - **Faturamento (período das viagens)** — para um faturamento quinzenal, considera o período das viagens que compõem a fatura, não o dia em que a fatura foi criada
  - **Emissão**
- Hoje o filtro "viagem" só funciona quando o lançamento aponta para uma única viagem. Passa a funcionar também para as faturas consolidadas: o período vem das viagens vinculadas ao fechamento (menor data de saída até a maior).
- Despesas e abastecimentos lançados com data dentro da viagem entram na quinzena daquela viagem.
- Os totais do rodapé passam a refletir exatamente a base escolhida.

### 2. Lançamentos: quinzena de referência
- No cadastro/edição de um lançamento, além das datas, um campo **Quinzena de referência** (mês + 1ª ou 2ª quinzena) que preenche a competência.
- Serve para despesas fixas (escritório, funcionários, descontos) caírem no resultado da quinzena que elas se referem, mesmo que o pagamento aconteça depois.
- Lançamentos antigos continuam como estão; a quinzena é derivada da competência já gravada.

### 3. Rentabilidade e relatórios (cliente, motorista, veículo/placa)
- Passam a usar sempre o **período de faturamento/operação**: tudo que ocorreu entre as datas escolhidas, independentemente de quando vence ou é pago.
- Receita: fretes das viagens do período, mais faturas consolidadas cujas viagens são do período (sem contar duas vezes).
- Custos: fechamento do motorista das mesmas viagens, abastecimentos, manutenções, descontos e despesas com quinzena de referência no período.
- Cada motorista/placa é atribuído pela viagem, nunca pelo resumo da fatura — assim placas e motoristas param de aparecer em quinzenas em que não rodaram.
- Aviso já existente de "motorista sem fechamento no período" é mantido e estendido a cliente e veículo.
- Fluxo de caixa continua separado, por recebimento/pagamento efetivo.

### 4. Dashboard
- Os atalhos de 15/30/90 dias passam a usar a mesma regra de faturamento dos relatórios, então os cartões batem com a tela de rentabilidade.
- Onde o número é de caixa (recebido/pago), o cartão diz isso no rótulo.

### 5. Viagem entrando direto no Contas a pagar do motorista
- Ao lançar/apurar uma viagem, ela gera automaticamente uma conta a pagar do motorista com o valor da **tabela de frete do motorista** (faixa + adicionais − descontos).
- Quando você faz o fechamento da quinzena, essas contas avulsas são canceladas e substituídas por uma única fatura do período, como já acontece hoje com o lado do cliente.
- Cancelar o fechamento devolve as contas avulsas.

## Detalhes técnicos

- `financeiro_lancamentos.data_competencia` já existe e é a base de competência; acrescentar índice e preenchimento consistente nos gatilhos de abastecimento/manutenção/despesa (data do fato) e de fechamento (período apurado).
- Nova coluna auxiliar não é necessária para a quinzena: derivada de `data_competencia` na UI.
- `src/components/financeiro/lancamentos-page.tsx`: novo enum de base de data (`vencimento` padrão, `pagamento`, `faturamento`, `emissao`); resolução do período de faturamento via `fechamento_viagens → viagens` para lançamentos com `fechamento_id`, com fallback em `data_competencia`.
- `src/hooks/use-bi-dados.ts`: consolidar uma única função de competência (viagem > fechamento > `data_competencia` > emissão) e manter `dataCaixa` só para pago com `data_pagamento`; expor mapa viagem→motorista/veículo/cliente como fonte única de atribuição.
- `src/routes/_authenticated/app/rentabilidade.tsx`, `relatorios.tsx` e componentes em `src/components/relatorios/*`: passar a consumir a competência única e a atribuição por viagem.
- `src/components/dashboards/admin-dashboard.tsx`: usar as mesmas séries do hook de BI.
- Motorista por viagem: gatilho `tg_viagem_financeiro` ganha par `pagar` calculado a partir da apuração de tabela do motorista (`src/lib/frete.ts` / `viagem_ajustes`), com `origem='viagem'`; `src/lib/fechamento.ts` cancela esses lançamentos ao confirmar e reativa ao cancelar.
- Migração de dados: apenas normalizar `data_competencia` faltante e gerar as contas a pagar avulsas de viagens ainda sem fechamento. Nenhum valor, vencimento ou pagamento histórico é alterado.

## Validação
- Conferir a quinzena 16–31/08 e 01–15/09 do cliente principal: receita, custo de motorista e margem iguais nos relatórios, na rentabilidade e no dashboard.
- Conferir que um faturamento com vencimento em setembro aparece na quinzena de agosto no filtro de faturamento e em setembro no filtro de vencimento.
