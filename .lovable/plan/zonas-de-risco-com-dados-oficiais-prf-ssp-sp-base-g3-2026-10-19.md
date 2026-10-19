# Zonas de risco com dados oficiais (PRF + SSP-SP + base G3)

## Objetivo
As cores do mapa de risco (Monitoramento, Planejador e alertas no celular do motorista) passam a refletir números oficiais dos últimos 3 anos, com os casos recentes pesando mais. A base G3 e os pontos validados a partir dos motoristas continuam valendo junto.

## Fontes
- **Acidentes PRF (Brasil todo, rodovias federais):** planilhas anuais "agrupadas por ocorrência", com o ponto exato, mortos e feridos de cada acidente. Atualização mensal pela PRF.
- **Roubo de carga SSP-SP:** totais publicados pela SSP-SP/SEADE por cidade ou região do estado, sem o ponto exato. Colore a área da cidade ou região, não um trecho de rua.
- **Base G3:** as zonas atuais e os reportes aprovados continuam como estão. A operação ainda pode ajustar ou desativar qualquer zona.

## Como o nível será calculado
1. Os acidentes da PRF são agrupados em áreas de cerca de 2 km. Cada acidente pesa 1, com ferido 2 e com morte 5.
2. Os anos pesam diferente: ano atual ×1,0, anterior ×0,7 e o de dois anos atrás ×0,4.
3. Para roubo de carga, o peso é a taxa por habitante de cada cidade ou região, comparada com a média do estado.
4. A nota de cada área é convertida em nível pela posição em relação às outras áreas, não por número fixo:
   - abaixo dos 60% de menor risco: verde;
   - de 60% a 85%: amarelo;
   - de 85% a 97%: laranja;
   - acima de 97%: vermelho.
   Áreas sem registro ficam fora do mapa, sem cor.
5. Onde houver zona oficial e zona G3 no mesmo lugar, vale o nível mais alto. O dossiê mostra a origem: "PRF 2023–2026", "SSP-SP" ou "G3".

## Atualização automática mensal
- Uma tarefa roda uma vez por mês, todo dia 5 de madrugada. Ela baixa a planilha do ano atual da PRF e os números novos da SSP e recalcula as cores. Não gasta créditos de IA.
- Os anos anteriores (2023 a 2025) são importados uma única vez agora.
- A tela Zonas de risco ganha um quadro "Dados oficiais" com a data da última atualização, a quantidade de áreas por nível e um botão "Atualizar agora", só para administradores.
- Se a fonte oficial mudar o link ou o formato, a atualização falha sem apagar nada. As cores do mês anterior ficam e a tela mostra o aviso.

## Limitações (honestas)
- A PRF cobre só rodovias federais. Estaduais (Anhanguera, Bandeirantes etc.) e ruas da cidade ficam com a base G3 e os reportes dos motoristas.
- Roubo de carga oficial existe em formato aproveitável só para SP, e por cidade ou região. Nos outros estados vale a base G3.
- Os dados oficiais têm atraso de 1 a 2 meses.

## Detalhes técnicos
- Novas colunas em `zonas_risco`: `fonte` (base_g3 / motorista / prf / ssp), `indice`, `ocorrencias`, `periodo`, `atualizado_em`. Zonas oficiais têm o par `fonte` + chave da área como único, para que cada atualização substitua os dados oficiais e preserve as zonas G3.
- Nova tabela `zonas_risco_importacoes` (fonte, iniciado/concluído, status, linhas, erro), com leitura só para administradores.
- Importação inicial (2023–2025): processada uma vez aqui, já agrupada; entram só as áreas agregadas, poucos milhares de linhas.
- Atualização mensal: rota `/api/public/hooks/zonas-oficiais`, chamada pelo agendamento mensal no banco. Lê o arquivo em fluxo, só do ano atual, para caber nos limites do servidor. Sem segredo, a rota só recalcula dados públicos e não aceita parâmetros que apaguem ou mudem dados G3.
- "Atualizar agora" chama uma função protegida que confere se o usuário é administrador.
- `useZonasRisco`, `avaliarRota`, `desenharZonas` e os alertas no celular continuam iguais. Zonas oficiais são lidas pela mesma consulta, filtradas por `ativo`. O Monitoramento ganha um filtro por fonte (Oficial / G3 / Motoristas).
- Teste automatizado da regra de níveis (pesos por ano e gravidade, cortes 60/85/97%).
