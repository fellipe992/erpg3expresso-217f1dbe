# Roadmap

## Concluído (relatórios e filtros por período de operação)
- Competência operacional no banco (migration 0008): `viagem_dia_operacao`, `viagem_total_motorista`, gatilhos de abastecimento/manutenção/despesa com a data do fato.
- Conta a pagar avulsa do motorista gerada pela viagem apurada; fechamento consolida (cancela avulsos) e o cancelamento devolve os avulsos.
- Contas a pagar/receber: filtro de período por vencimento (padrão), pagamento/recebimento, faturamento (período das viagens) e data do lançamento.
- Campo "Quinzena de referência" no lançamento (preenche a competência).
- Rentabilidade/relatórios: competência = viagem > fechamento > competência digitada > emissão; caixa apenas com pagamento realizado.

## Em aberto
- Validar na tela as quinzenas 16–31/08 e 01–15/09 do cliente principal (receita/custo/margem iguais em relatórios, rentabilidade e dashboard).

## Em andamento (rentabilidade líquida por quinzena)
- Usar o valor líquido da fatura do cliente, rateando descontos extras entre as viagens para manter motorista e placa corretos.
- Manter o fechamento bruto do motorista como custo e usar a viagem avulsa somente quando não existir fatura ativa.

## Concluído (consistência financeiro × rentabilidade)
- Atalho de atrasados mostra pendentes vencidos e lançamentos com status atrasado; pagamentos atualizam imediatamente os relatórios.
- Valores de fechamento na rentabilidade são identificados como custo/valor do motorista, sem sugerir pagamento realizado.
- Lançamentos avulsos de viagens já consolidadas são ignorados no BI, e novos pagamentos/fechamentos duplicados ficam bloqueados.
- OS 288: duplicidade avulsa cancelada com justificativa, preservando o fechamento #26 e o histórico.
