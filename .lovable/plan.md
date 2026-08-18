# Trocar o envio do Hunter para Google Workspace

## Objetivo
Substituir o envio atual, bloqueado pela validação de DNS, pela conta **fellipe@g3expresso.com.br** via Gmail/Google Workspace. Isso não altera MX, NS ou o recebimento de e-mails do domínio.

## Etapas

1. **Conectar a conta correta**
   - Autorizar `fellipe@g3expresso.com.br` no conector Gmail com permissão somente para envio.
   - Não reutilizar a conexão atual `atmnexusai@gmail.com`, pois ela mostraria o remetente errado.

2. **Trocar o provedor de envio no servidor**
   - Criar um helper exclusivo do Gmail que monte o e-mail HTML e texto em formato compatível com a API.
   - Enviar pelo endpoint oficial do Gmail usando a conta conectada, sem expor credenciais no navegador.
   - Manter assunto, conteúdo, identidade visual e resposta para `fellipe@g3expresso.com.br`.

3. **Preservar o fluxo comercial existente**
   - Manter os botões individual e em lote do Hunter.
   - Continuar criando/reaproveitando o lead, registrando “E-mail de apresentação enviado”, atualizando o último contato e gravando o histórico.
   - Preservar a deduplicação para não reenviar a apresentação ao mesmo endereço.
   - Registrar no histórico a mensagem real retornada pelo Gmail em caso de falha.

4. **Ajustar feedback e limites**
   - Remover mensagens específicas de “domínio não verificado” desse fluxo.
   - Mostrar erros de autorização, limite diário ou rejeição do destinatário de forma clara.
   - Manter o lote limitado e sequencial para reduzir risco de bloqueio da conta Google.

5. **Validar ponta a ponta**
   - Enviar um teste pelo Hunter para o endereço indicado.
   - Confirmar que o e-mail aparece em “Enviados” da conta Workspace.
   - Confirmar no CRM a criação/reutilização do lead, a atividade e o registro no histórico.

## Detalhes técnicos
- A chamada ao Gmail ficará somente no servidor e passará pelo gateway seguro da conexão.
- O envio usará `users/me/messages/send` com mensagem RFC 2822 codificada em base64url.
- A função de envio será isolada em módulo server-only; os wrappers `createServerFn` continuarão finos.
- Nenhuma alteração de DNS, banco ou infraestrutura de recebimento será feita.

## Pré-requisito durante a execução
Será exibida a autorização do Gmail. Nela, escolha/adicone **fellipe@g3expresso.com.br**, não a conexão `atmnexusai@gmail.com`.
