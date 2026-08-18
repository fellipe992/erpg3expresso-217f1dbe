# Liberar o envio de e-mails: alternativas de DNS

## O que aconteceu

Você confirmou que o Zone Editor do cPanel não oferece o tipo de registro **NS**. Sem registros NS no subdomínio `notify.g3expresso.com.br`, a Lovable não consegue assumir essa zona e gerenciar SPF/DKIM/MX, então o domínio fica preso em "Pendente" e nenhum e-mail sai.

Isso é uma limitação do painel DNS que você está usando hoje — não dá para contornar com outros tipos de registro (A, CNAME, TXT etc.).

## Alternativas viáveis

### Opção 1 — Migrar o DNS para Cloudflare (recomendada, mais rápida)

Cloudflare tem plano gratuito e suporta registros NS para subdomínios.

1. Crie uma conta gratuita em Cloudflare.
2. Adicione o domínio `g3expresso.com.br`.
3. Cloudflare fará uma varredura dos seus registros DNS atuais — revise e confirme para não quebrar site/e-mail existente.
4. No registrador (Registro.br), troque os nameservers do domínio para os que o Cloudflare indicar.
5. No Cloudflare, adicione os registros exatos para a Lovable:
   - TXT `_lovable-email.g3expresso.com.br` → `lovable_email_verify=b0fae125892e925fb64d4b7eb15e94447ee547ebc592e5090ee21acd154e8470`
   - NS `notify.g3expresso.com.br` → `ns5.lovable.cloud`
   - NS `notify.g3expresso.com.br` → `ns6.lovable.cloud`
6. Aguarde a propagação (pode levar até 72h, mas geralmente é minutos).

### Opção 2 — Transferir o domínio para a Lovable

Se você preferir não gerenciar DNS, pode transferir o domínio para a Lovable (Workspace settings → Workspace domains). Com o domínio na Lovable, a delegação de e-mail é criada automaticamente sem precisar adicionar NS manualmente.

### Opção 3 — Manter cPanel e usar outro subdomínio/delegação

Não é possível com a infraestrutura atual da Lovable: o envio de e-mails exige delegação por NS. Outros tipos de registro não substituem isso.

## Depois que a DNS for ajustada

Assim que os registros NS estiverem publicados, eu:

1. Verifico novamente o status do domínio.
2. Disparo o e-mail de teste pelo Hunter para o endereço que você indicar.
3. Confirmo no CRM que o lead, a atividade "E-mail de apresentação enviado" e o registro no histórico de envios apareceram.

## Observação sobre código

Nenhuma alteração de código é necessária: o template, o disparo individual, o disparo em lote, o registro no funil e o histórico já estão implementados e prontos para funcionar no momento em que o domínio for verificado.

## Detalhe do endereço de teste

Você mencionou `fellipe@gmail.com` — se esse não for um endereço real seu, o envio pode ser recusado ou cair em bloqueio. Me confirme o e-mail de teste que devo usar.
