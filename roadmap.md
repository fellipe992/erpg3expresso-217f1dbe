# Roadmap

## Concluído (relatórios e filtros por período de operação)
- Competência operacional no banco (migration 0008): `viagem_dia_operacao`, `viagem_total_motorista`, gatilhos de abastecimento/manutenção/despesa com a data do fato.
- Conta a pagar avulsa do motorista gerada pela viagem apurada; fechamento consolida (cancela avulsos) e o cancelamento devolve os avulsos.
- Contas a pagar/receber: filtro de período por vencimento (padrão), pagamento/recebimento, faturamento (período das viagens) e data do lançamento.
- Campo "Quinzena de referência" no lançamento (preenche a competência).
- Rentabilidade/relatórios: competência = viagem > fechamento > competência digitada > emissão; caixa apenas com pagamento realizado.

## Em aberto
- Validar na tela as quinzenas 16–31/08 e 01–15/09 do cliente principal (receita/custo/margem iguais em relatórios, rentabilidade e dashboard).

## Em andamento
- Corrigir a divergência de atraso entre Contas a pagar e Rentabilidade, incluindo o atalho de atrasados.
- Impedir e corrigir lançamentos avulsos de motorista quando a viagem já estiver em fechamento ativo (OS 288).
