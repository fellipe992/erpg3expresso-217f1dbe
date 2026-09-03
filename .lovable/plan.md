# Emissão de CT-e e MDF-e integrada à Bsoft (Hivecloud)

Objetivo: emitir documentos fiscais de transporte direto do ERP, sem redigitar dados no Bsoft.

## Como a API da Bsoft funciona (verificado nos dois swaggers)

- Autenticação: header `Authorization: Bearer <token>` + header `tenantID`.
- CT-e: `POST /v1/integracoes/cte` cria o rascunho, `POST /v1/integracoes/ctes/emitir` envia (com `idList`, `enviarEmail`, `averbarCte`) e devolve um `transactionId`.
- A emissão é assíncrona: consulta-se `/emitir/{id}/consultar-status` até concluir e depois `/emitir/{id}/obter-resultado`.
- Também existem: cancelar, consultar situação por chave de acesso, substituir, CT-e complementar, imprimir DACTE, exportar XML, enviar e-mail, cadastro de empresas e envolvidos (remetente/destinatário/tomador).
- MDF-e: `POST /v1/integracoes/mdfes` (criar), `/mdfes/emitir`, `/encerrar`, `/cancelar`, `/consultar`, `/imprimir-documento-mdfe`, `/exportar-mdfe` — mesmo padrão assíncrono.

## O que será construído

### 1. Tela “Documentos fiscais” (novo item no menu, perfis admin/gestor/financeiro)
- Abas **CT-e** e **MDF-e**, com lista, filtros (período, cliente, número, série, status) e badges de status (rascunho, processando, autorizado, cancelado, rejeitado).
- Ações por documento: ver detalhes, baixar DACTE/PDF, baixar XML, enviar por e-mail, cancelar, consultar situação na SEFAZ.

### 2. Emissão a partir da viagem
- Botão **Emitir CT-e** na viagem concluída/apurada.
- Formulário pré-preenchido com cliente (tomador/destinatário), origem/destino, veículo, motorista, peso/carga e valor apurado do frete (frete + pedágio + adicionais − descontos), revisável antes do envio.

### 3. Emissão a partir do fechamento do cliente
- Na tela de Fechamento, botão **Emitir CT-e do fechamento**: gera um único CT-e com o valor consolidado do fechamento, listando as viagens/OS vinculadas nas observações/documentos.
- O número/chave do CT-e fica gravado no fechamento e aparece no relatório e no PDF.

### 4. Emissão de CT-e avulso
- Formulário independente para casos fora de viagem/fechamento (remetente, destinatário, tomador, valores, tipo de serviço, CFOP, tributação).

### 5. MDF-e
- Selecionar CT-es já autorizados + veículo + motorista e emitir o manifesto; ações de encerrar (ao final da viagem) e cancelar; download do DAMDFE e XML.

### 6. Registro no banco
- Nova tabela de documentos fiscais (tipo, número, série, chave de acesso, status, valor, id Bsoft, id de transação, vínculos com viagem/fechamento/cliente, timestamps) com RLS e grants por papel; vínculo MDF-e ↔ CT-es.
- Nada é apagado: tudo incremental, sem alterar dados históricos.

## Detalhes técnicos

- Toda a comunicação com a Bsoft passa por server functions (`src/lib/fiscal.functions.ts` + `fiscal.server.ts`); token e tenantID nunca chegam ao navegador.
- Emissão assíncrona: server function inicia, grava `transactionId`, e a tela faz polling do status via server function até autorizar/rejeitar, mostrando o motivo da rejeição na íntegra.
- Cadastro de empresa emitente e envolvidos sincronizados sob demanda a partir de `clientes` e `company_settings`.
- Erros da API são repassados com status + corpo, para o motivo de rejeição da SEFAZ ficar visível.

## Credenciais (pendente)

Você ainda não tem o token. Vou implementar tudo e, no final, pedir por formulário seguro `BSOFT_API_TOKEN` e `BSOFT_TENANT_ID` (gerados no painel Bsoft/Hivecloud, em integrações/API). Até serem cadastrados, a tela funciona em modo “não configurado”, exibindo aviso em vez de erro.

## Sugestão de sequência

1. Tabela + integração base + tela de listagem + emissão a partir da viagem.
2. Emissão a partir do fechamento + CT-e avulso.
3. MDF-e (emitir, encerrar, cancelar) e downloads.

Se preferir, faço tudo em uma única entrega.
