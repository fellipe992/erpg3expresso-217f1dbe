## Módulo CRM G3 — plano de execução

O escopo pedido equivale a um produto inteiro (Agendor). Vou entregar em 5 fases, cada uma funcionando de ponta a ponta, sem quebrar nada do ERP atual. Começo pela Fase 1 assim que você aprovar.

### Princípio de integração
Nada de cadastro duplicado: `clientes`, `financeiro_lancamentos`, `viagens`, `veiculos`, `motoristas` e `profiles/user_roles` continuam sendo a fonte da verdade. O CRM adiciona apenas as tabelas que hoje não existem e referencia as atuais por FK.

---

### Fase 1 — Base do CRM: Leads, Funil e Oportunidades
- Novas tabelas: `crm_leads`, `crm_oportunidades`, `crm_etapas` (funil configurável com as 10 etapas pedidas), `crm_atividades` (timeline), `crm_etiquetas`.
- Kanban arrastável com as etapas Lead → Fechado Perdido; toda movimentação grava histórico automático.
- Cadastro de Lead com todos os campos listados (empresa, contato, cargo, telefones, WhatsApp, origem, potencial, classificação, prioridade, etiquetas, próximo contato…).
- Conversão de Lead → Cliente reaproveitando a tabela `clientes` (checagem de CNPJ/CPF para evitar duplicidade).
- Ficha da oportunidade com timeline cronológica.
- Menu "Comercial" na sidebar, seguindo o visual atual (laranja #F15A24, claro/escuro, responsivo).

### Fase 2 — Dashboard Comercial e Relatórios
- Dashboard com os 13 KPIs pedidos (oportunidades abertas, em negociação, receita prevista/fechada, meta, % da meta, ticket médio, conversão, tempo médio de fechamento, ganhos, perdidos, clientes ativos/inativos).
- Gráficos: funil, receita por mês/cliente/vendedor, origem dos leads, conversão por etapa, evolução mensal.
- Tabela `crm_metas` (meta mensal por vendedor/equipe).
- 14 relatórios com exportação PDF e Excel, reutilizando `export-utils.ts` e a ordenação estilo Excel já existente.

### Fase 3 — Agenda, Tarefas e Notificações
- `crm_compromissos` (ligação, reunião, visita, follow-up, cobrança, retorno) e `crm_tarefas`.
- Agenda integrada com visão por dia/semana/mês e lista.
- Notificações no sino/central e push mobile: novo lead, nova oportunidade, follow-up vencido, tarefa vencida, proposta aprovada/recusada, cliente sem contato há 30 dias, contrato vencendo (via rotina agendada já existente).

### Fase 4 — Propostas, Contratos e integração Financeira/Operacional
- `crm_propostas` (rascunho → enviada → em negociação → aprovada → recusada) com anexos e histórico; PDF da proposta.
- Ao marcar "Fechado Ganho": cria o Cliente se não existir, gera contas a receber, contrato e permite abrir viagem/frete já preenchidos.
- Ficha 360º do cliente: viagens (quantidade, KM, última viagem/motorista/veículo), receita por período/veículo/motorista, faturado/recebido/em aberto/atrasado, margem, últimos recebimentos e histórico único cronológico.

### Fase 5 — IA comercial, WhatsApp, E-mail e Permissões finais
- Assistente comercial com IA (resumo do histórico e de reuniões, sugestão de próximo contato, geração de mensagem de WhatsApp e e-mail, probabilidade de fechamento, alertas de inatividade e de proposta vencendo).
- Botão de WhatsApp em todas as telas, com registro automático na timeline.
- Registro de e-mails enviados/recebidos vinculados ao cliente.
- Papéis comerciais (Diretor, Gerente Comercial, Comercial, Assistente) e RLS: cada usuário vê apenas seus próprios registros; administrador e diretor veem tudo.

---

### Detalhes técnicos
- Banco: novas tabelas em `public` com GRANTs explícitos, RLS por responsável + função `is_staff`/papéis, triggers de auditoria e timeline automática (mesmo padrão de `tg_plano_auditoria`).
- Papéis novos entram no enum `app_role`; regras atuais de administrador/financeiro/gestor/motorista permanecem intactas.
- Frontend: rotas em `src/routes/_authenticated/app/crm/*`, componentes reutilizáveis em `src/components/crm/`, drag-and-drop com `@dnd-kit`, tabelas com o `sortable.tsx` atual, exportação com jsPDF/xlsx já instalados.
- IA via Lovable AI (sem chave nova), em server function protegida.
- Nenhuma tabela ou tela existente é alterada de forma destrutiva.

### Antes de começar
Duas definições rápidas (posso assumir o padrão se preferir):
1. Meta mensal: por vendedor, por equipe, ou ambos? (padrão: ambos)
2. Vendedor responsável: qualquer usuário do sistema ou apenas quem tiver papel comercial? (padrão: apenas papéis comerciais + administrador)
