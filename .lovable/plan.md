# Liberar o envio de e-mails: corrigir a delegação DNS

## O que a verificação mostrou

Consultei o DNS público agora:

- TXT `_lovable-email.g3expresso.com.br` → **correto**, já publicado com o valor esperado.
- `notify.g3expresso.com.br` → **errado**: foi criado como um registro **CNAME** apontando para `ns5.lovable.cloud`, e não como dois registros **NS**. Também falta o segundo servidor (`ns6.lovable.cloud`).

Por isso o domínio continua em "Pendente": sem os registros NS, a Lovable não consegue assumir a zona `notify.g3expresso.com.br` e nenhum e-mail sai.

## O que precisa ser feito no cPanel (Zone Editor)

1. **Remover** o registro atual `notify` do tipo **CNAME** (valor `ns5.lovable.cloud`).
2. **Adicionar** dois registros do tipo **NS**:
   - Nome: `notify` — Valor: `ns5.lovable.cloud`
   - Nome: `notify` — Valor: `ns6.lovable.cloud`
3. Manter o TXT `_lovable-email` como está (já está certo).
4. Não alterar A, MX ou CNAME existentes do domínio principal.

Se o Zone Editor do cPanel não oferecer o tipo NS na tela simples, use a opção de edição avançada da zona; caso o painel realmente não permita NS, as alternativas são mover o DNS para um provedor que permita (ex.: Cloudflare, plano gratuito) mantendo o registrador atual.

## Depois disso

Assim que os NS estiverem publicados, eu:

1. Verifico novamente o status do domínio.
2. Disparo o e-mail de teste pelo Hunter para o endereço que você indicar.
3. Confirmo no CRM que o lead, a atividade "E-mail de apresentação enviado" e o registro no histórico de envios apareceram.

## Observação sobre código

Nenhuma alteração de código é necessária: o template, o disparo individual, o disparo em lote, o registro no funil e o histórico já estão implementados e prontos para funcionar no momento em que o domínio for verificado.

## Detalhe do endereço de teste

Você mencionou `fellipe@gmail.com` — se esse não for um endereço real seu, o envio pode ser recusado ou cair em bloqueio. Me confirme o e-mail de teste que devo usar.
