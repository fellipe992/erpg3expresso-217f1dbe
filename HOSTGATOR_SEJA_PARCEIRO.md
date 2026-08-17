# Integração HostGator → ERP G3 Expresso (Captação de Parceiros)

O ERP já expõe a API pública `POST /api/public/parceiros` para receber os dados preenchidos no formulário **Seja Parceiro** do site institucional.

> **Endpoint de produção**
> ```
> https://erpg3expresso.lovable.app/api/public/parceiros
> ```
> Ele aceita requisições de **qualquer domínio** (CORS aberto) e insere a candidatura na fila de aprovação do ERP.

---

## O que você precisa fazer no site da HostGator

Localize o código JavaScript da página `Seja Parceiro` que hoje monta a mensagem do WhatsApp e, **antes** de abrir o WhatsApp, chame a função abaixo para enviar os dados também para o ERP.

```javascript
async function enviarCandidaturaParaERP(dados) {
  try {
    await fetch('https://erpg3expresso.lovable.app/api/public/parceiros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    });
  } catch (err) {
    // Não interrompe o fluxo do WhatsApp se o ERP estiver off-line
    console.error('Erro ao enviar candidatura para ERP:', err);
  }
}

// Exemplo de uso no envio do formulário
const dadosDoFormulario = {
  nome: document.getElementById('nome')?.value,
  documento: document.getElementById('documento')?.value,
  telefone: document.getElementById('telefone')?.value,
  whatsapp: document.getElementById('whatsapp')?.value,
  email: document.getElementById('email')?.value,
  cidade: document.getElementById('cidade')?.value,
  estado: document.getElementById('estado')?.value,
  uf: document.getElementById('uf')?.value,
  tipoVeiculo: document.getElementById('tipoVeiculo')?.value,
  modelo: document.getElementById('modelo')?.value,
  ano: document.getElementById('ano')?.value,
  placa: document.getElementById('placa')?.value,
  capacidade: document.getElementById('capacidade')?.value,
  carroceria: document.getElementById('carroceria')?.value,
  temAntt: document.getElementById('temAntt')?.value,
  numeroAntt: document.getElementById('numeroAntt')?.value,
  regioes: document.getElementById('regioes')?.value,
  tiposCarga: document.getElementById('tiposCarga')?.value,
  experiencia: document.getElementById('experiencia')?.value,
  sobre: document.getElementById('sobre')?.value,
};

// Envia para o ERP em segundo plano
await enviarCandidaturaParaERP(dadosDoFormulario);

// Depois continua abrindo o WhatsApp normalmente...
```

> **Requisitos mínimos:** pelo menos o campo `nome` é obrigatório. Todos os outros campos são opcionais — envie vazio ou omita se não existir no formulário.

---

## Campos suportados pelo endpoint

| Campo no JS      | O que representa                         | Obrigatório |
|------------------|------------------------------------------|-------------|
| `nome`           | Nome completo do motorista/parceiro      | Sim         |
| `documento`      | CPF/CNPJ                                 | Não         |
| `telefone`       | Telefone de contato                     | Não         |
| `whatsapp`       | WhatsApp                                | Não         |
| `email`          | E-mail                                  | Não         |
| `cidade`         | Cidade                                  | Não         |
| `estado` / `uf`  | Estado/UF                               | Não         |
| `tipoVeiculo`    | Tipo do veículo (caminhão, truck, etc.) | Não         |
| `modelo`         | Marca/modelo do veículo                 | Não         |
| `ano`            | Ano do veículo                          | Não         |
| `placa`          | Placa                                   | Não         |
| `capacidade`     | Capacidade de carga (kg)                | Não         |
| `carroceria`     | Tipo de carroceria                      | Não         |
| `temAntt`        | Possui ANTT? (`sim`/`não`)              | Não         |
| `numeroAntt`     | Número da ANTT                          | Não         |
| `regioes`        | Regiões de atuação                      | Não         |
| `tiposCarga`     | Tipos de carga aceitos                  | Não         |
| `experiencia`    | Experiência profissional                | Não         |
| `sobre`          | Outras informações                      | Não         |

---

## Como testar a integração

1. Publique o snippet no site da HostGator.
2. Preencha o formulário **Seja Parceiro** e envie.
3. No ERP, acesse **Comercial → Captação de Parceiros**.
4. A nova candidatura deve aparecer com status **Pendente**.
5. Clique em **Aprovar** para verificar se o sistema cria automaticamente o registro de **Motorista** e **Veículo** (agregado) com os dados enviados.

---

## Publicar o site pelo Lovable (alternativa de médio prazo)

Se você quiser deixar tudo no Lovable no futuro:

1. Crie/importe o projeto do site institucional no Lovable.
2. Conecte o domínio da HostGator em **Project Settings → Domains**:
   - Aponte `A` records `@` e `www` para `185.158.133.1`.
   - Adicione o `TXT` record `_lovable` com o valor de verificação que a plataforma fornecer.
3. Publique o site no Lovable.
4. Aí a integração fica editável diretamente no código do projeto — sem precisar colar snippet na HostGator.

---

## Dúvidas?

Se o formulário enviar e nada aparecer no ERP, verifique:
- Se a URL do `fetch` está exatamente `https://erpg3expresso.lovable.app/api/public/parceiros`.
- O console do navegador (F12) por erros de rede/CORS.
- Se o campo `nome` está sendo enviado preenchido (é o único obrigatório).
