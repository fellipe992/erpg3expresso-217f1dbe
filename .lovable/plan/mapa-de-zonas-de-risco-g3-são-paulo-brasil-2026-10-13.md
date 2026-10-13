# Mapa de Zonas de Risco G3 (São Paulo + Brasil)

## Objetivo
Colorir os mapas da G3 por nível de risco (roubo de carga, assalto, acidentes), avisar o motorista ao entrar numa zona, sugerir uma rota mais segura no Planejador e permitir que o motorista reporte zonas para a operação validar.

## Escala de cores
- Verde: tranquilo
- Amarelo: médio
- Laranja: alto
- Vermelho: muito alto (crítico)

## 1. Base inicial de zonas (sem custo de IA)
Cadastro fixo, montado uma única vez a partir de dados públicos conhecidos (SSP-SP, PRF, relatórios de roubo de carga):
- Grande São Paulo: zonas críticas por região (ex.: Zona Leste/Guarulhos, Zona Norte/Marginal Tietê, ABC, Osasco/Barueri, CEAGESP, entorno do Rodoanel).
- Principais rodovias de SP: Dutra, Fernão Dias, Anhanguera, Bandeirantes, Régis, Anchieta/Imigrantes, Castello, Rodoanel — trechos críticos.
- Brasil: corredores de carreta com histórico alto (RJ — Av. Brasil/Baixada; BR-116 BA; BR-101; BR-153; BR-364 MT/RO; Grande BH; Região Metropolitana do Recife, entre outros).
Cada zona tem: nome, tipo (roubo, assalto, acidente), nível, horário de maior risco, recomendação e origem ("base G3" ou "reportada por motorista").
Gravado direto no banco — não usa IA, então não consome créditos.

Observação: são estimativas baseadas em informação pública; a operação pode ajustar o nível de qualquer zona.

## 2. Camada de risco no Monitoramento
- Áreas coloridas sobre o mapa, com legenda e botão para ligar/desligar.
- Ao clicar numa zona: nível, tipo, horário crítico e recomendação.
- Alerta para a operação quando um caminhão entra numa zona laranja ou vermelha.

## 3. Aviso para o motorista
- No app do motorista: aviso ao se aproximar de uma zona laranja/vermelha ("Zona de alto risco a 2 km — evite paradas").
- O cálculo é feito no próprio celular com a lista de zonas: sem custo extra por posição.

## 4. Rota mais segura no Planejador de Rotas
- Além da rota mais eficiente, pede ao Google rotas alternativas na mesma consulta (sem chamadas extras).
- Cada rota recebe uma nota de risco pelas zonas que atravessa (quanto tempo/km dentro de amarelo, laranja, vermelho).
- Opção "Rota mais segura": mostra as duas lado a lado com km, tempo, pedágio e risco.
- Tipo de carga (ex.: eletrônicos, alimentos, medicamentos, combustível, carga geral) aumenta o peso do risco — cargas visadas priorizam a rota segura e o sistema avisa quando a eficiente passa por zona vermelha.

## 5. Motorista reporta zona de risco
- Botão "Reportar risco" no app: usa a posição atual (ou bairro digitado), tipo, nível percebido e comentário.
- Vai para uma fila "Zonas reportadas" na tela da operação, com mapa.
- Operação aprova (define nível final), ajusta ou recusa. Aprovada, entra automaticamente no mapa com a cor escolhida.
- Histórico guardado: quem reportou, quem validou e quando.

## Custo de créditos
- Zonas e cores: zero (dados fixos no banco).
- Avisos ao motorista e na operação: zero (cálculo local).
- Rota segura: usa a mesma chamada do Google Maps que já existe, com alternativas — sem IA.
- Nenhuma parte depende de IA.

## Detalhes técnicos
- Tabela `zonas_risco` (nome, tipo, nivel 1–4, geometria como círculo centro/raio ou polígono jsonb, horario_critico, recomendacao, uf, origem, ativo, validado_por, validado_em) + `zonas_risco_reportes` (motorista, lat/lng, bairro, tipo, nivel_sugerido, comentario, status pendente/aprovado/recusado). RLS: leitura para autenticados; escrita de zonas só admin/operação; reportes inseridos pelo motorista, revisão por admin.
- Seed da base inicial via migração com INSERTs literais.
- Monitoramento: `google.maps.Circle`/`Polygon` com cores por nível; checagem de entrada por haversine em `src/lib/geo.ts`.
- Motorista: checagem de proximidade em `use-viagem-tracking` com throttle e sem repetir o mesmo aviso.
- Planejador: `/api/planejador-rota` passa a `computeAlternativeRoutes: true` sempre e devolve todas as polylines; o cliente decodifica e calcula a pontuação de risco por amostragem de pontos; peso por tipo de carga.
- Nova tela de validação dos reportes no menu Operação.
