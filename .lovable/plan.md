# Roteiro no Google Maps em viagens concluídas + Relatório por quinzena com datas de pagamento

## 1. Roteiro no Google Maps nas viagens concluídas

- Na tela da viagem, o botão "Abrir no Google Maps" hoje só aparece junto das ações de viagem planejada ou em andamento.
- Passa a aparecer também em viagens **concluídas**, num cartão "Roteiro". Ele abre a rota completa (origem, paradas e destino) no Google Maps, só para consulta.
- As ações de operação (finalizar, abastecer etc.) continuam escondidas nas viagens concluídas.

## 2. Forma de pagamento no cadastro

No cadastro de **cliente** e de **motorista**, um novo campo **Prazo de recebimento/pagamento**:

| Opção | Regra |
|---|---|
| À vista | Na data em que a viagem termina |
| Semanal | Na segunda-feira seguinte à semana da viagem |
| Quinzenal imediato | Viagens de 1 a 15: dia 16. Viagens de 16 ao fim do mês: dia 1 do mês seguinte |
| Quinzenal com uma quinzena na casa | Viagens de 1 a 15: dia 1 do mês seguinte. Viagens de 16 ao fim do mês: dia 16 do mês seguinte |
| Personalizado (dias) | Usa o número de dias que já está configurado hoje |

- Os motoristas começam com a regra que já está configurada hoje (quinzenal, 30 dias). Os clientes começam como "Quinzenal com uma quinzena na casa" até você mudar.
- Novos fechamentos e faturas calculam o vencimento por essa regra, e você ainda pode mudar a data à mão.
- Os lançamentos que já existem não mudam.

## 3. Relatório por quinzena (Rentabilidade e Relatórios)

- Nova aba **"Quinzena"** com três escolhas: mês, 1ª ou 2ª quinzena e empresa. Clientes, placas e motoristas são opcionais.
- O relatório usa o período em que as viagens e despesas aconteceram. Ele mostra:
  1. **Resumo:** entradas, saídas, resultado e margem, além do total já recebido/pago e do que está em aberto.
  2. **Entradas por cliente:** viagens, valor e **data prevista de recebimento**, com situação recebido, a vencer ou atrasado.
  3. **Saídas por motorista:** valor do fechamento e **data prevista de pagamento**, com a situação.
  4. **Por placa:** receita, diesel/arla, manutenção, despesas, motorista e resultado.
  5. **Todas as despesas:** abastecimentos, manutenções, despesas fixas e descontos, com a data de pagamento de cada uma.
  6. **Agenda da quinzena:** uma linha do tempo das datas em que você recebe e paga, com o total de cada dia.
- Tudo pode ser exportado em PDF e Excel.

## 4. Contas a pagar e a receber mais simples

- Nova coluna **"Referente a"**, por exemplo "2ª quinzena ago/26" ou "OS 288", ao lado do vencimento.
- Atalhos rápidos: **Hoje**, **Esta semana**, **Próxima semana** e **Atrasados**. Eles usam a data de vencimento.
- No topo, três cartões: **A receber/pagar no período**, **Atrasado** e **Já recebido/pago**. Cada um mostra o total e a quantidade.
- Linhas atrasadas ficam destacadas, com o número de dias de atraso.

## Detalhes técnicos

- `viagens.$id.tsx`: tirar o `NavegacaoButton` (em modo só consulta) do bloco condicionado ao status e mostrar para `concluida`.
- Migração: enum `prazo_pagamento` ('a_vista','semanal','quinzenal_imediato','quinzenal_casa','dias') e colunas `prazo_pagamento` e `prazo_dias` em `clientes` e `motoristas`, com o valor padrão descrito acima. Sem alterar dados financeiros.
- `src/lib/prazo-pagamento.ts`: `calcularVencimento(regra, dataFimPeriodo)` e `quinzenaDe(data)`. Usado em `src/lib/fechamento.ts` e no relatório (o previsto vem do `data_vencimento` real quando existe, e da regra quando não existe).
- `src/components/relatorios/relatorio-quinzena.tsx`: consome `use-bi-dados` (competência + atribuição por `fechamento_viagens → viagens`). Entra como aba em `rentabilidade.tsx` e `relatorios.tsx`.
- `lancamentos-page.tsx`: coluna de referência derivada de `data_competencia`/fechamento/viagem, presets de período e cartões de resumo.

## Validação

- Abrir uma viagem concluída e conferir que o Google Maps abre a rota.
- No relatório de 01–15/08/2026, conferir que os totais batem com a Rentabilidade e que as datas previstas seguem a regra de cada cliente e motorista.
