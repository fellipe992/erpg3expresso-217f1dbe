# WhatsApp Business integrado: avisos aos clientes, alertas e chat do motorista

## Antes de começar (importante)
- A conexão usa o **WhatsApp Business oficial (Meta)** pelo conector do Lovable. Responder clientes é grátis; mensagens que **a G3 inicia** fora de uma conversa aberta nas últimas 24h precisam de **modelos aprovados pela Meta** (até 48h de análise) e podem ter custo da Meta.
- Seu número continua funcionando no app WhatsApp Business do celular: você vê e responde por lá normalmente.
- O histórico antigo de conversas só pode ser importado nas primeiras 24h após conectar.

## 1. Conectar o número
- Abrir o cartão de conexão do WhatsApp; você conclui o cadastro da Meta com seu número Business.
- Selecionar este projeto como destino das mensagens recebidas.

## 2. Monitores do cliente (cadastro do cliente)
- Nova seção "Monitores / WhatsApp" no cadastro de cada cliente: nome, cargo, número (vários por cliente), e caixas de quais avisos cada um recebe:
  início de viagem, saída para próxima entrega, entrega concluída, fim de viagem, zona de risco, alertas do motorista, posição atual.
- Também uma lista de **números internos da G3** (seu e da equipe) que recebem todos os alertas.

## 3. Avisos automáticos
Disparados pelo próprio sistema, sem você fazer nada:
- **Início de viagem** e **fim de viagem**.
- **Saída para próxima entrega** (quando o motorista confirma o próximo cliente) e **entrega concluída** (descarga concluída).
- **Zona de risco** (entrada em zona laranja/vermelha) e **alertas do motorista** (ALERTA/MONITORAR) — internos sempre; clientes só se marcados.
- **Posição**: link do mapa / rastreio público junto de cada aviso.
- Cada aviso tem uma versão de modelo aprovado pela Meta (criamos os modelos em português).
- Tela de histórico com status de cada mensagem: enviada, entregue, lida, falhou.

## 4. Resposta automática
- Mensagens recebidas de números cadastrados (cliente/monitor) que perguntam "onde está?", "previsão?" recebem resposta automática com posição e próxima entrega da viagem ativa daquele cliente.
- Demais mensagens: resposta automática de recebimento em horário fora do expediente, e a conversa fica para a equipe responder.

## 5. Chat na tela do motorista
- Nova aba "Chat" no app do motorista. Ele escolhe: **G3 (interno)** ou **Monitor do cliente** (lista dos monitores do cliente da viagem atual).
- O que o motorista escreve vai pelo WhatsApp da G3 para o contato escolhido, identificado ("Motorista João · Placa ABC1D23: ...").
- Quando a G3 ou o monitor responde no WhatsApp, a resposta aparece no chat do motorista no app (com aviso no celular).
- O número do motorista não é exposto ao cliente; tudo passa pelo número da G3.
- Regra: com várias viagens/motoristas falando com o mesmo contato, a resposta vai para a conversa ativa mais recente com aquele contato; a equipe também pode responder pela tela de chat no sistema escolhendo o motorista.

## Limitações a saber
- Primeira mensagem do motorista para um monitor que não falou com a G3 nas últimas 24h sai como modelo ("Motorista X quer falar sobre a entrega, responda esta mensagem"); depois a conversa flui livre.
- Respostas suas feitas pelo celular para o motorista: só são encaminhadas ao app se você responder citando a mensagem dele (ou na conversa ativa mais recente).

## Detalhes técnicos
- Conector WhatsApp via gateway; receptor `POST /api/public/whatsapp/webhook` com verificação de assinatura e caixa de entrada durável `whatsapp_webhook_events` (idempotente, recuperação de pendentes).
- Tabelas novas: `cliente_contatos_whatsapp` (cliente, nome, número E.164, eventos jsonb), `whatsapp_contatos_internos`, `whatsapp_mensagens` (saída/entrada, wamid, status com timestamps, viagem, motorista, contato), `motorista_chat_mensagens` (conversa motorista↔G3/monitor). RLS: equipe vê tudo, motorista só a própria conversa; grants em todas.
- Envio sempre por serverFn autenticada; eventos de viagem (início/fim/entrega/a caminho/SOS/zona) chamam um despachante único que resolve destinatários e escolhe modelo vs texto livre conforme a janela de 24h.
- Modelos criados via `/message_templates` (UTILITY, pt_BR) e acompanhados até aprovação.
- Realtime no chat do motorista; caixa alta mantida no cadastro (exceto números).
