# Compartilhamento externo do rastreio (link público)

Permitir que o usuário monitor (ou a equipe interna) gere, para uma viagem específica, um link público que mostra apenas o mapa com a posição atual do caminhão — sem login e sem qualquer dado do motorista.

## Como vai funcionar

1. Na Central de Monitoramento, cada viagem em andamento ganha um botão **Compartilhar rastreio**.
2. O sistema gera um link único (ex.: `.../rastreio/aB3xY...`) com botões **Copiar link** e **Compartilhar**.
3. Quem abre o link vê uma página simples com:
   - o mapa com o caminhão na posição atual, atualizando sozinho a cada ~20 segundos;
   - a hora da última atualização;
   - o logotipo e as cores da G3.
4. Nada mais aparece: sem nome, foto ou telefone do motorista, sem placa, sem valores, sem origem/destino, sem acesso a qualquer outra tela.
5. O link deixa de funcionar automaticamente quando a viagem é concluída ou cancelada, mostrando "Entrega finalizada". O monitor também pode revogar o link antes disso.
6. Se a mesma viagem já tiver um link ativo, o botão reaproveita o mesmo link em vez de criar outro.

## Quem pode gerar

Usuário monitor (apenas para viagens dos clientes que ele monitora) e equipe interna (administrador, gestor, financeiro).

## Detalhes técnicos

**Banco (migration)**
- Nova tabela `viagem_compartilhamentos`: `id`, `viagem_id` (FK), `token` (text único, aleatório ~24 chars), `created_by`, `created_at`, `revogado_em` (nullable).
- GRANTs: `SELECT, INSERT, UPDATE` para `authenticated`; `ALL` para `service_role`. Sem acesso a `anon`.
- RLS: staff (`private.is_staff`) vê/cria/revoga tudo; monitor vê/cria/revoga apenas quando a viagem pertence a um cliente vinculado a ele (`private.is_monitor_cliente`), reaproveitando o padrão já usado em `viagens`.
- Índice em `token` e em `viagem_id`.

**Endpoint público** — `src/routes/api/public/rastreio.$token.ts`
- `GET` com o token; usa `supabaseAdmin` carregado dentro do handler.
- Valida token, checa `revogado_em IS NULL` e `viagens.status = 'em_andamento'`; senão retorna `{ status: 'encerrado' }` (404/200 sem coordenadas).
- Resposta mínima e explícita: `{ status, latitude, longitude, atualizadoEm }` — lida da última linha de `viagem_localizacoes` daquela viagem. Nenhum outro campo é projetado.
- Headers `Cache-Control: no-store` e `X-Robots-Tag: noindex`.

**Página pública** — `src/routes/rastreio.$token.tsx`
- Rota top-level (sem `_authenticated`), sem gate de auth, `head()` com `noindex`.
- Mapa renderizado com Leaflet + tiles OpenStreetMap (dependência nova `leaflet`), importado dinamicamente dentro de `<ClientOnly>`. Motivo: a chave do Google Maps hoje só é servida a usuários autenticados (`/api/google-maps-config`) e não deve ser exposta em página pública.
- Polling do endpoint público a cada 20 s via `useQuery` (`refetchInterval`), sem uso do cliente Supabase do navegador.

**UI de geração** — `src/routes/_authenticated/app/monitoramento.tsx`
- Botão por viagem abre um diálogo com o link, "Copiar", "Compartilhar" (Web Share API com fallback) e "Revogar link".
- Server functions em `src/lib/rastreio-publico.functions.ts` com `requireSupabaseAuth` para criar/reaproveitar e revogar (RLS aplica a permissão).

**Verificação**: `bunx tsgo --noEmit`, criação de um link em viagem de teste, abertura do link em janela sem sessão e conferência de que a resposta pública não traz dados do motorista.
