# Liberar o Roteirizador Inteligente para o cliente (usuário monitor)

Dar ao seu cliente acesso à tela do Roteirizador, com tudo funcionando — montar entregas, otimizar rotas, exportar e imprimir — menos a parte de escolher motorista e disparar a carga. Ele salva a roteirização e você, como gestor, abre o mesmo projeto e faz a distribuição para os motoristas.

## Como vai funcionar para você

- Na tela de Usuários, cada usuário passa a ter uma caixinha de permissão extra: **"Roteirizador inteligente"**. Você marca no usuário monitor do cliente e ele passa a ver a tela.
- Sem a caixinha marcada, nada muda: o monitor continua vendo só o Monitoramento.
- No menu lateral do cliente aparece o item "Roteirizador" junto de "Monitoramento".

## Como vai funcionar para o cliente

Ele tem acesso completo a:

- Cadastrar depósitos, entregas, importar planilha de entregas
- Definir a frota (quantidade de veículos) e as regras de jornada
- Gerar, dividir, mesclar, otimizar e editar rotas no mapa
- Painel de IA, dashboard executivo e comparador de cenários
- Exportar sequência, mapa de carregamento, resumo e imprimir roteiro
- Salvar, abrir e excluir os projetos **dele** (não vê projetos de outros clientes)

Não tem acesso a:

- Selecionar motorista em cada rota e o botão "Disparar rotas"
- Qualquer lista de motoristas ou veículos da sua frota
- A aba de rastreamento das viagens já despachadas

No lugar do bloco de motorista, cada rota mostra um aviso: a roteirização foi salva e será distribuída pela equipe G3.

## Do seu lado (gestor/admin)

- Na lista de "Projetos" do Roteirizador aparece quem salvou cada projeto (nome do usuário e cliente) e a data da operação, para você abrir o projeto do cliente e atribuir os motoristas normalmente.
- Nada do fluxo atual de atribuição e disparo muda.

## Detalhes técnicos

**Banco**

- Nova tabela `user_permissoes (user_id uuid, permissao app_permissao, unique(user_id, permissao))` com enum `app_permissao` contendo `roteirizador`; GRANT para `authenticated` (SELECT) e `service_role` (ALL); RLS: usuário lê as próprias, admin gerencia todas via `private.has_role`.
- Função `private.tem_permissao(_user_id uuid, _perm app_permissao)` security definer, usada em políticas e no app.
- `roteirizacao_projetos`: manter a política de staff e acrescentar políticas SELECT/INSERT/UPDATE/DELETE para `created_by = auth.uid()` **e** `private.tem_permissao(auth.uid(), 'roteirizador')`.

**Front**

- `src/hooks/use-auth.tsx`: expõe `permissoes: string[]` (query em `user_permissoes`) e helper `can("roteirizador")`.
- `src/routes/_authenticated/route.tsx`: monitor com a permissão pode abrir `/app/roteirizador` (allowlist em vez de rota única).
- `src/components/app-sidebar.tsx`: `monitorNav` ganha o item Roteirizador quando a permissão existe.
- `src/routes/_authenticated/app/roteirizador.tsx`: substituir o bloqueio `if (!isStaff)` por `isStaff || can("roteirizador")`; `podeDespachar = isStaff` controla o botão "Disparar rotas", a aba Rastreamento e o hook `useMotoristasComVeiculo` (não é chamado para o cliente).
- `src/components/roteirizador/rotas-panel.tsx` recebe `podeDespachar` e só renderiza `AtribuirRota` quando verdadeiro.
- `src/hooks/use-projetos-roteirizacao.ts`: listar também `created_by` e juntar nome do usuário/cliente para exibir a origem do projeto na lista de Projetos.
- `src/routes/_authenticated/app/usuarios.tsx` + `src/lib/users.functions.ts`: checkbox de permissão no criar/editar usuário, gravando em `user_permissoes` via `supabaseAdmin` com registro em auditoria.
