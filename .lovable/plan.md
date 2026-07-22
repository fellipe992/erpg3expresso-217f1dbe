# Central de Monitoramento em Tempo Real

Módulo novo para Administrador e Gestor acompanharem viagens em andamento no mapa, com o motorista compartilhando localização automaticamente.

## 1. Banco de dados (1 migration)

**Nova tabela `viagem_localizacoes`** — histórico de posições:
- viagem_id, motorista_id, veiculo_id
- latitude, longitude, precisao, velocidade, heading
- bateria (nullable), online (bool)
- created_at

Índices por (viagem_id, created_at desc) e uma view/consulta auxiliar para "última posição por viagem em andamento".

**RLS/GRANTs:**
- Motorista insere apenas as próprias posições, apenas se a viagem estiver `em_andamento`.
- Admin/Gestor leem tudo. Financeiro/Motorista sem acesso de leitura (motorista só escreve).
- Realtime habilitado (`ALTER PUBLICATION supabase_realtime ADD TABLE`) para atualização push.

## 2. Conexão Google Maps

Usar o connector Google Maps já disponível na plataforma. Preciso confirmar/conectar com você antes de codar o mapa (mapa carrega com a chave de browser gerenciada; geocoding reverso da "cidade atual" vai pelo gateway).

## 3. Frontend — captura de localização (motorista)

Novo hook `useViagemTracking(viagemId)`:
- Ao entrar em `em_andamento`, pede permissão e chama `navigator.geolocation.watchPosition`.
- Envia posição ao Supabase a cada ~12s ou em mudança significativa (>25m).
- Lê `navigator.getBattery()` e `navigator.onLine` quando disponíveis.
- Para imediatamente ao finalizar/cancelar; grava última posição.
- Aviso na tela do motorista: manter app aberto durante a viagem.

Integrar no fluxo de "Iniciar viagem" (dispara permissão) e "Finalizar" (para o watcher).

## 4. Frontend — tela de monitoramento

Nova rota `/_authenticated/app/monitoramento` (Admin + Gestor apenas).

Layout:
- **Esquerda (30%)** — painel de operações: busca por placa/motorista, filtros (motorista, veículo, cliente, origem, destino, período), lista de cards com placa, modelo, motorista + foto, cliente, origem→destino, status, tempo desde o início, km percorrido, cidade atual, última atualização, bateria, online/offline, botão "Centralizar".
- **Direita (70%)** — Google Maps com marcadores customizados de caminhão (laranja G3). Clique abre InfoWindow/card com foto do veículo/motorista, telefone, placa, modelo, cliente, origem, destino, OS, data, hora início, tempo, km, última atualização, status, botão "Abrir detalhes da viagem".

Query inicial carrega viagens `em_andamento` + última localização; subscription em `viagem_localizacoes` atualiza apenas os marcadores alterados (sem redesenhar o mapa). "Cidade atual" via geocoding reverso (cache por ~2min por viagem).

## 5. Menu e dashboard

- Sidebar: novo item "Monitoramento" (ícone `Radar` ou `MapPinned`), visível só para Admin/Gestor.
- Dashboard Admin: novo card "🚚 Viagens em andamento — N veículos em operação" que linka para `/app/monitoramento`.

## 6. Histórico de rota

Na tela de detalhes da viagem (`viagens.$id.tsx`), botão "Visualizar Rota" (após haver localizações) que abre modal com mapa mostrando origem, destino, polyline do trajeto, última posição, distância total (soma dos segmentos) e tempo total.

## 7. Notificações

Toast no app para Admin/Gestor quando uma viagem inicia/finaliza, via subscription na tabela `viagens` (evento update em `status`). Sem notificações push nativas nesta entrega.

## Fora do escopo (preparado para futuro, não implementado agora)
Geofencing, alertas de desvio, ETA automático, replay animado da rota, push notifications nativas.

## Detalhes técnicos

- Realtime só na tabela `viagem_localizacoes` filtrando por evento INSERT; um único channel na tela de monitoramento.
- Marcadores usam `google.maps.Marker` com ícone SVG inline laranja G3 (sem AdvancedMarkerElement/mapId).
- Rotação do ícone segue `heading` quando disponível.
- Buffer local no cliente motorista: se `navigator.onLine === false`, enfileira posições e faz flush ao voltar online.
- Reverse geocoding chamado no servidor (server function) para não expor a chave e permitir cache.

## Pergunta antes de codar
Precisa que eu abra o fluxo para conectar o Google Maps (connector) agora? Sem isso o mapa não carrega. Confirma que posso seguir com a migration + toda a implementação acima?
