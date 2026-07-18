# Fluxo Operacional Completo da Viagem — Motorista

Vou entregar um fluxo mobile-first onde o motorista opera 100% pelo celular: consulta antecipada, checklist de saída obrigatório com fotos, ações durante a viagem (ocorrências, fotos, despesas, abastecimentos), encerramento com canhoto e recalculo automático de KPIs.

## 1. Banco de Dados (1 migration)

**Novas tabelas:**
- `viagem_ocorrencias` — data/hora auto, local, descricao, observacoes, viagem_id, motorista_id, created_by
- `viagem_anexos` — categoria (`checklist_saida`, `checklist_chegada`, `ocorrencia`, `canhoto`, `entrega`, `veiculo`), path no Storage, viagem_id, ocorrencia_id (opcional), descricao, created_by
- `viagem_auditoria` — evento (`iniciada`, `checklist_saida`, `ocorrencia`, `foto`, `finalizada`, `canhoto`), viagem_id, usuario_id, detalhes JSONB, timestamp

**Alterações:**
- `checklists`: novas colunas booleanas específicas (pneus_ok, oleo_ok, agua_radiador_ok, freios_ok, tacografo_ok) mantendo `itens` JSONB para compatibilidade
- `viagens`: colunas `iniciada_por`, `finalizada_por`, `observacoes_finais`

**RLS:** motorista vê/insere apenas os próprios registros; staff (admin/gestor/financeiro) tem acesso total. GRANTs completos.

**Triggers de auditoria** para registrar automaticamente eventos-chave.

**Remover restrição de data**: garantir que motorista consulta viagens `planejadas` mesmo com data futura (já está OK via RLS por motorista_id — apenas confirmar).

## 2. Frontend — Rotas e Componentes

### `src/routes/_authenticated/app/viagens.tsx` (Motorista)
Já lista as viagens do motorista. Vou reorganizar em **abas por status** (Planejadas / Em andamento / Concluídas) com cards mobile-first mostrando: OS, cliente, origem→destino, data prevista, veículo, status, botão "Visualizar".

### `src/routes/_authenticated/app/viagens.$id.tsx` (Detalhe — reescrita mobile-first)
Reestruturar o arquivo atual em seções colapsáveis/tabs:

1. **Informações Gerais** (já existe, ajustar layout mobile)
2. **Checklist de Saída** — botão "Iniciar Viagem" abre modal em etapas com os campos específicos (pneus com foto obrigatória, óleo, água, freios, tacógrafo, observações, fotos múltiplas do veículo). Só depois de salvo o checklist, muda status → `em_andamento` e registra `data_saida`, `iniciada_por`.
3. **Durante a viagem** (visível quando `em_andamento`): 4 botões — Registrar Ocorrência, Adicionar Foto, Lançar Despesa (link para financeiro pré-preenchido), Lançar Abastecimento (link para abastecimentos pré-preenchido).
4. **Ocorrências** — lista + botão "Nova ocorrência" (form: local, descrição, fotos).
5. **Encerramento** — botão "Finalizar Viagem" abre form: data/hora encerramento, KM final, observações, canhoto (foto ou PDF), fotos de entrega. Ao confirmar → status `concluida`, registra `finalizada_por`.
6. **Movimentações financeiras** (já existe).
7. **Auditoria** — timeline dos eventos (visível para staff).

### Novos componentes
- `src/components/viagem/checklist-saida-dialog.tsx` — modal multi-step com upload de fotos
- `src/components/viagem/ocorrencia-dialog.tsx`
- `src/components/viagem/finalizar-viagem-dialog.tsx` — com upload de canhoto e fotos de entrega
- `src/components/viagem/upload-fotos.tsx` — componente reutilizável (aceita múltiplas, usa `capture="environment"`, guarda em `viagem-fotos/{viagemId}/{categoria}/`)

## 3. Storage

Reutilizar bucket `viagem-fotos` já existente. Policies atuais já permitem motorista vinculado. Estrutura de paths:
```
{viagemId}/checklist_saida/*.jpg
{viagemId}/checklist_chegada/*.jpg
{viagemId}/ocorrencia/{ocorrenciaId}/*.jpg
{viagemId}/canhoto/*.{jpg,pdf}
{viagemId}/entrega/*.jpg
```

## 4. Atualizações automáticas ao finalizar

Trigger `tg_viagem_financeiro` já existe. Adicionar/garantir:
- KM rodados = km_final - km_inicial (já calculado no cliente)
- Dashboards já usam `useQuery`; invalidações cruzadas já implementadas.
- Auditoria: trigger na `viagens` para registrar `iniciada`/`finalizada`.

## 5. Interface

- Reutilizar `mobile-motorista-shell.tsx` (já ativo).
- Botões grandes, cards com bastante padding, uploads com `capture="environment"` para câmera direto.
- Preservar Design System (brand orange, cards, badges).

## Detalhes técnicos

- Todo upload usa `supabase.storage.from('viagem-fotos').upload(path, file)`.
- Foto de pneus é validada como obrigatória antes de habilitar "Concluir checklist".
- Ocorrências: `data`/`hora` gravadas com `now()` no banco (default).
- Canhoto aceita `image/*,application/pdf`.
- Todas as mutações invalidam: `["viagem", id]`, `["viagens"]`, `["viagem-anexos", id]`, `["viagem-ocorrencias", id]`, `["viagem-auditoria", id]`, `["admin-dashboard"]`, `["motorista-dashboard"]`, `["financeiro"]`.

Confirma que posso seguir com a migration + reescrita?
