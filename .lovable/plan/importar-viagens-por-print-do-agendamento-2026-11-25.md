# Importar viagens por print do agendamento

## O que muda para você

Na tela **Viagens**, ao lado de "Nova viagem", um botão **Importar viagens**:

1. Você sobe um ou vários prints (como os do WhatsApp do cliente). Cada print = uma viagem.
2. A IA lê de cada print: data,  placa, nome do motorista e a lista de destinos (nome da escola, endereço, bairro, cidade, UF,  sequência).
3. Antes de lançar, aparece uma tela de conferência:
  - Pergunta da data: **Hoje** ou **Amanhã** (padrão: amanhã), aplicada a todas.
  - Por print: placa → veículo do cadastro, motorista encontrado (pelo CPF, depois placa/nome), com opção de trocar manualmente; destinos editáveis.
  - Endereços com número cortado são completados pela busca do Google (nome da escola + bairro + cidade), já trazendo a localização no mapa.
  - Avisos em amarelo quando placa/motorista não forem encontrados.
  - para cada viagem gerada, abre um preview para voce confirmar os enderecos e a data, motorista e placa, confirmados, será lançada a viagem planejada ao motorista, 
4. Botão **Lançar viagens**: cria uma viagem planejada por motorista, com as entregas na ordem da sequência, cliente pré-selecionado (último cliente usado nessas importações), e o nº de viagem do cliente nas observações. Prints repetidos (mesmo nº de viagem do cliente) são avisados para não duplicar.

## Detalhes técnicos

- Função no servidor `lerAgendamentoPrint` (`src/lib/importar-viagem.functions.ts`, autenticada, só equipe) usando Gemini Flash da chave própria com fallback no gateway, saída JSON estruturada.
- Casamento: placa normalizada contra `veiculos.placa`; CPF contra `motoristas.cpf`; fallback motorista vinculado ao veículo.
- Geocodificação com a chave do Google Maps já existente.
- Gravação reaproveita a criação atual de viagem + `sincronizarParadas`, data prevista = data escolhida (fuso São Paulo), textos em caixa alta.
- Componente `src/components/viagem/importar-viagens-dialog.tsx`; teste para normalização de placa/CPF e regra hoje/amanhã.