# Contrato do motorista agregado com assinatura na tela

## 1. Texto do contrato (revisado a partir do seu modelo)

Mantém tudo o que você já tinha e corrige/acrescenta:

- **Partes**: G3 Transportes e Serviços Logísticos Ltda (CNPJ 50.468.812/0001-34, Cotia/SP) e o Contratado com Nome da empresa, CNPJ/CPF, RNTRC, nome do motorista responsável, CPF, CNH e placa do veículo — preenchidos automaticamente.
- **1. Objeto e natureza** — relação comercial, sem vínculo empregatício (Lei 11.442/2007).
- **2. Modalidade e CIOT** — agregação por período, CIOT quinzenal (1–15 e 16–fim do mês); RNTRC e veículo ativos.
- **3. Tabela de frete (novo reforço)** — o Contratado declara que conhece e **aceita a tabela de frete da G3**, e que novas versões da tabela serão comunicadas antes de entrar em vigor.
- **4. Condição de pagamento (novo)** — fechamento quinzenal, pagamento conforme o prazo cadastrado para o motorista (hoje 30 dias), após conferência das viagens e entrega de canhotos/comprovantes.
- **5. Vale-pedágio** — Tag antecipada, não integra o frete (Lei 10.209/2001); uso fora das rotas da G3 é descontado.
- **6. Custos do veículo** — combustível, manutenção, pneus, impostos e multas por conta do Contratado.
- **7. Checklist, processos e descontos (novo)** — o Contratado se obriga a fazer os checklists de saída/chegada e os apontamentos no aplicativo conforme os processos combinados; erros, avarias, falta de apontamento, extravio ou canhoto não entregue poderão ser descontados no acerto da quinzena, com o registro no sistema como comprovação; o Contratado declara concordar previamente e renuncia a contestar descontos aplicados nesses termos, tendo direito a ver o demonstrativo antes do pagamento.
- **8. Exclusividade e não concorrência (reforçado)** — durante o contrato não prestar serviços para outras transportadoras nem diretamente para clientes da G3 sem autorização por escrito; após o encerramento, 1 ano sem atender diretamente ou por terceiros os clientes da G3 em que operou.
- **9. Multa** — corrigida para um valor claro: soma dos fretes recebidos da G3 nos últimos 12 meses (limitada ao que a lei permite), mais perdas e danos.
- **10. Sem vínculo com cliente final.**
- **11. Sigilo e dados (novo)** — não divulgar clientes, preços e rotas; autoriza o uso de localização (GPS) durante as viagens.
- **12. Vigência e rescisão** — prazo indeterminado, aviso prévio de 15 dias.
- **13. Assinatura eletrônica e foro (novo)** — assinatura na tela tem validade (MP 2.200-2/2001), registrada com data, hora e dispositivo; foro de Cotia/SP.

Observação: é um modelo; vale uma revisão final do seu advogado, principalmente na multa e na exclusividade.

## 2. Assinar pelo perfil do motorista

Na tela **Perfil** do motorista aparece o cartão "Contrato de prestação de serviços":
1. Botão **Assinar contrato**.
2. Ele confirma/preenche: **CNPJ** (com busca automática do nome da empresa), **Nome da empresa** e **RNTRC**. Os outros dados (nome, CPF, CNH, placa) vêm do cadastro.
3. Mostra o contrato completo já preenchido para leitura, com a caixa "Li e concordo".
4. Campo para **assinar com o dedo** na tela (botão limpar).
5. Ao confirmar, gera o **PDF do contrato com a assinatura**, data e hora, e fica salvo.
6. Depois de assinado, o cartão mostra "Assinado em dd/mm/aaaa" e botão para baixar o PDF.

## 3. Acesso da equipe G3

- Em **Motoristas** e no perfil do usuário (Usuários): situação "Contrato assinado / Pendente" e botão para baixar o PDF assinado.
- Só a equipe interna e o próprio motorista veem o contrato dele.
- Se o texto mudar no futuro, a equipe pode pedir nova assinatura (a versão antiga fica guardada).

## Detalhes técnicos

- Migração: tabela `motorista_contratos` (motorista_id, user_id, versao, cnpj, razao_social, rntrc, dados_snapshot jsonb, assinatura_path, pdf_path, assinado_em, ip, user_agent, status) com GRANTs e RLS: motorista lê/insere o próprio; staff lê tudo. Colunas `cnpj_empresa`, `razao_social`, `rntrc` em `motoristas` atualizadas com o que ele informar.
- Bucket privado `contratos` (motorista grava na própria pasta, staff lê), URLs assinadas.
- `src/lib/contrato-motorista.ts` com o texto versionado (v1) e preenchimento; PDF gerado com jsPDF no navegador (logo G3, assinatura como imagem).
- Assinatura em `<canvas>` com eventos de toque/ponteiro (sem biblioteca nova).
- CNPJ reutiliza a consulta já existente (`cnpj.functions.ts`).
- Componentes: `components/perfil/contrato-card.tsx`, `assinar-contrato-dialog.tsx`; uso em `perfil.tsx`, `perfil-usuario-dialog.tsx` e `motoristas.tsx`.
