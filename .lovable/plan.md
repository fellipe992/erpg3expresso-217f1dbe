# Peças, Descontos (Antecipação) e abastecimentos de agregados no fechamento

## O que muda para você
1. **Nova página "Peças" no Operacional**: lançar peças compradas (data, placa, motorista, descrição, quantidade, valor, fornecedor, nota).
2. **Nova página "Descontos" no Operacional**: lançar antecipações/descontos do motorista (data, motorista, descrição, valor). No fechamento e no PDF sai com o nome **"Antecipação"** + a descrição.
3. **Abastecimentos de agregados**: continuam na página atual de Abastecimentos (lançados por vocês ou pelo motorista no app). Quando a placa é de agregado, o lançamento vira um desconto pendente do motorista.
4. **Fechamento do motorista agregado** (ex.: 16 a 30/11): ao montar o fechamento, o sistema busca sozinho as peças, abastecimentos e antecipações com data dentro do período e ainda não descontados, e mostra cada um como desconto com a descrição completa (ex.: "PEÇA: FILTRO DE ÓLEO PSL655 – 25/11", "ABASTECIMENTO DIESEL S10 120 L – 25/11", "ANTECIPAÇÃO: ...").
   - Você pode desmarcar um item, e continua podendo lançar descontos manuais (avaria de mercadoria etc.) antes de finalizar.
   - Ao finalizar, os itens ficam vinculados àquele fechamento e não entram em outra quinzena. Se o fechamento for cancelado, voltam a ficar pendentes.
   - O valor a pagar ao motorista já sai abatido.
5. **PDF do fechamento**: nova seção com os abastecimentos, peças e antecipações descontados, com data, descrição e valor, e o total descontado.
6. **Carro próprio**: peças e abastecimentos seguem como hoje, entrando no Contas a Pagar normal da empresa.

## Regras
- O período usa a data do lançamento (peça, abastecimento, antecipação), no fuso de São Paulo.
- Agregado = veículo marcado como agregado no cadastro (o motorista vem do lançamento ou do vínculo atual do veículo).
- Lançamentos de agregado não geram conta a pagar da empresa (a despesa é do motorista). Abastecimentos de agregado já lançados antes não serão alterados sem sua autorização.
- Textos em caixa alta, menos números e datas.

## Detalhes técnicos
- Tabelas novas `pecas` e `motorista_antecipacoes` (RLS + grants, papéis administrador/gestor/financeiro; motorista vê só as próprias).
- Colunas `fechamento_id` (nullable) em `abastecimentos`, `pecas` e `motorista_antecipacoes` para marcar o desconto já aplicado; `fechamento_descontos` ganha `origem`/`origem_id` para rastrear o item.
- Gatilhos financeiros (`tg_abastecimento_financeiro` e o equivalente de peças) passam a pular veículos agregados; para próprios, peça gera conta a pagar como manutenção/peça.
- `src/lib/fechamento.ts`: buscar pendentes do período por motorista, gravar em `fechamento_descontos` com origem e marcar `fechamento_id`; no cancelamento, limpar o vínculo.
- Rotas novas `app/pecas.tsx` e `app/descontos.tsx` no menu Operacional; PDF do fechamento com a seção de descontos detalhados.
- Teste: item de 25/11 entra no fechamento de 16–30/11 e não no de 01–15/11; item já vinculado não entra de novo; antecipação sai rotulada "ANTECIPAÇÃO".
