# Tabelas de frete, apuração de viagem e Fechamentos

## O que já existe (análise)

- **Clientes** (`clientes`), **motoristas** (`motoristas`), **veículos** (`veiculos` com `tipo` = tipologia em enum: cavalo, carreta, truck, toco, van, vuc, utilitario, outro).
- **Viagens** (`viagens`) já têm `valor_frete`, `pedagio_estimado`, `outros_custos_estimados`, comissão e provisões, além de `cliente_id`, `motorista_id`, `veiculo_id`.
- **Financeiro** (`financeiro_lancamentos`) recebe automaticamente, por trigger, um "a receber" por viagem com frete (`origem='viagem'`), e "a pagar" de abastecimento/manutenção/despesa — todos já vinculados a viagem, cliente, veículo e motorista.
- **Rentabilidade/DRE** usa a receita dos lançamentos da viagem e, quando não houver lançamento ativo, cai de volta no `valor_frete` da própria viagem. Isso permite consolidar o faturamento sem perder rentabilidade.

Conclusão: nada será apagado nem recriado. O novo módulo se apoia nessas relações e apenas acrescenta tabelas e campos.

## O que será criado no banco (novas tabelas/campos, nenhuma exclusão)

1. `tipologias_veiculo` — tipologias dinâmicas (Fiorino, Van, VUC, Toco, 3/4, Truck, Carreta, Bitruck…). Semeada com as tipologias atuais para compatibilidade; `veiculos` ganha `tipologia_id` opcional (preenchido a partir do `tipo` atual, que continua existindo).
2. `frete_tabelas` — uma tabela por cliente e por destino (`cliente` ou `motorista`), com vigência e auditoria.
3. `frete_faixas` — faixas de raio personalizáveis (km inicial, km final, descrição, ordem) com validação de sobreposição.
4. `frete_precos` — preço por faixa × tipologia.
5. `viagem_ajustes` — descontos e adicionais da viagem: descrição, valor, tipo (desconto/adicional/pedágio) e destino (cliente, motorista ou ambos).
6. `viagens` ganha: `usar_tabela_cliente`, `frete_faixa_id`, `frete_motorista`, `pedagio_cliente`, `pedagio_motorista`. `valor_frete` continua sendo o frete do cliente (compatível com o histórico).
7. `fechamentos` — número sequencial, tipo (cliente/motorista), cliente, motorista, período, descrição, vencimento, valor, status (aberto/confirmado/cancelado), auditoria.
8. `fechamento_viagens` — vínculo fechamento × viagem, com unicidade por tipo para impedir faturar a mesma viagem duas vezes.
9. `fechamento_descontos` — descontos extras do fechamento do motorista (posto, adiantamento, multa, vale…).
10. `financeiro_lancamentos` ganha `fechamento_id`, para ligar a fatura/pagamento ao fechamento.

Todas as novas tabelas com GRANTs, RLS por papel (staff escreve; motorista lê apenas o que lhe pertence) e `created_at/updated_at`.

## Regras de cálculo (um único módulo)

`src/lib/frete-viagem.ts` centraliza:

```text
TOTAL CLIENTE   = frete cliente + pedágio cliente + adicionais cliente - descontos cliente
TOTAL MOTORISTA = frete motorista + pedágio motorista + adicionais motorista - descontos motorista
```

Todo desconto sempre reduz o motorista; reduz o cliente só quando marcado "abater do cliente". Pedágios e adicionais podem ter valores/destinos independentes.

## Telas

- **Cliente → aba "Tabelas de frete"**: duas planilhas independentes (cliente e motorista), faixas de raio editáveis nas linhas e tipologias nas colunas, com aviso de faixas sobrepostas.
- **Viagem → área financeira reestruturada**: chave "Usar tabela de frete do cliente"; com ela ligada aparece o seletor de raio e o frete do cliente é calculado pela tabela + tipologia lida automaticamente da placa; o frete do motorista é calculado pela tabela de motorista. Com ela desligada, o frete do cliente é digitado e o do motorista ainda pode vir da tabela. Seções de Descontos, Pedágios e Adicionais em modais, mais o resumo financeiro cliente × motorista. Motorista continua sem ver valores.
- **Nova tela "Fechamento"** (menu Financeiro), com abas Cliente e Motorista: filtros de cliente/motorista/placa/período, tabela com seleção por linha e "selecionar todas", totalizadores dinâmicos, descontos extras (aba motorista) e botão "Apurar fechamento" com resumo, descrição sugerida editável e vencimento antes de confirmar.
- **Contas a receber/pagar**: cada lançamento de fechamento ganha as ações "Visualizar fechamento", "Gerar PDF" e "Exportar Excel", com relatório viagem por viagem, descontos e adicionais detalhados e total idêntico ao lançamento.

## Consolidação sem duplicidade

Ao confirmar um fechamento de cliente, os "a receber" individuais daquelas viagens saem do fluxo (status cancelado, com observação apontando o número do fechamento) e passa a valer somente a fatura consolidada. As viagens, seus valores e seu histórico permanecem intactos — a rentabilidade por cliente continua usando o frete da viagem, e o lançamento do fechamento é marcado como consolidação para não somar receita duas vezes no DRE gerencial.

O "a pagar" gerado pelo fechamento do motorista mantém motorista, fechamento e viagens vinculadas, e recebe o cliente das viagens quando for único — preservando o custo do motorista na rentabilidade do cliente.

Se alguma viagem selecionada já pertencer a um fechamento do mesmo tipo, o sistema bloqueia e informa o número do fechamento existente.

## Status e auditoria

Cada viagem exibe badge de fechamento: Aberta, Fechada cliente, Fechada motorista ou Fechada cliente e motorista, com o número do fechamento. Fechamentos confirmados só mudam por ação explícita de cancelamento/reabertura, que reverte os lançamentos gerados e fica registrado na auditoria.

## Ordem de execução

1. Migração das novas tabelas e campos (mostrada para aprovação antes de rodar).
2. Módulo de cálculo + tabelas de frete no cadastro do cliente.
3. Área financeira da viagem (tabela, raio, tipologia automática, descontos/pedágios/adicionais, resumo).
4. Tela de Fechamento (cliente e motorista) com apuração e geração dos lançamentos.
5. Relatórios PDF/Excel e ações no contas a receber/pagar.
6. Testes dos 17 cenários listados, incluindo verificação de que nenhum registro histórico foi alterado.
