# Plano: Integrar site HostGator com API de Captação de Parceiros do ERP

## Resumo
O ERP G3 Expresso já possui a API pública `POST /api/public/parceiros` pronta para receber os dados do formulário "Seja Parceiro" do site institucional. Como o site está na HostGator, a integração é feita adicionando um snippet JavaScript na página que dispara o envio para o ERP antes (ou junto) de abrir o WhatsApp.

## Pergunta do usuário: ficaria mais fácil se o site estivesse no Lovable?
Sim. Se o site institucional também estiver no Lovable, a conexão fica mais simples porque:
- Conseguimos editar o formulário diretamente no código do projeto.
- Não precisa inserir snippet manualmente na HostGator.
- O domínio customizado pode ser conectado ao projeto do site e tudo continua centralizado.

Porém, **não é obrigatório**: a API pública já permite requisições de qualquer domínio (CORS aberto), então a HostGator funciona normalmente.

---

## Opção A: manter site na HostGator (mais rápido)

1. Localizar no site o formulário/JS que abre o WhatsApp na página `Seja Parceiro`.
2. Adicionar o snippet abaixo para que, ao clicar em enviar, os dados também sejam enviados ao ERP.
3. O snippet envia um `POST` para o endpoint do ERP em produção e, em seguida, pode abrir o WhatsApp normalmente.

### Endpoint de destino
```
https://erpg3expresso.lovable.app/api/public/parceiros
```

### Snippet para colar na HostGator
```javascript
async function enviarParaERP(dados) {
  try {
    await fetch('https://erpg3expresso.lovable.app/api/public/parceiros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados)
    });
  } catch (e) {
    // falha silenciosa: não bloqueia o envio do WhatsApp
    console.error('Falha ao enviar para ERP', e);
  }
}

// Exemplo de uso no submit do formulário
const dados = {
  nome: document.getElementById('nome').value,
  documento: document.getElementById('documento').value,
  telefone: document.getElementById('telefone').value,
  whatsapp: document.getElementById('whatsapp').value,
  email: document.getElementById('email').value,
  cidade: document.getElementById('cidade').value,
  estado: document.getElementById('estado').value,
  uf: document.getElementById('uf').value,
  tipoVeiculo: document.getElementById('tipoVeiculo').value,
  modelo: document.getElementById('modelo').value,
  ano: document.getElementById('ano').value,
  placa: document.getElementById('placa').value,
  capacidade: document.getElementById('capacidade').value,
  carroceria: document.getElementById('carroceria').value,
  temAntt: document.getElementById('temAntt').value,
  numeroAntt: document.getElementById('numeroAntt').value,
  regioes: document.getElementById('regioes').value,
  tiposCarga: document.getElementById('tiposCarga').value,
  experiencia: document.getElementById('experiencia').value,
  sobre: document.getElementById('sobre').value
};

await enviarParaERP(dados);
// continua abrindo o WhatsApp...
```

> O endpoint já aceita valores vazios/nulos para campos opcionais. Não precisa preencher todos.

---

## Opção B: migrar o site para o Lovable (recomendado no médio prazo)

1. Criar ou usar o projeto do site institucional no Lovable.
2. Conectar o domínio da HostGator ao projeto do site em **Project Settings → Domains**:
   - Apontar `A` records `@` e `www` para `185.158.133.1`.
   - Adicionar `TXT` record `_lovable` com o valor de verificação fornecido.
3. Publicar o site no Lovable.
4. Editar a página `Seja Parceiro` no projeto do site para enviar o `POST` diretamente para o ERP, usando a mesma URL do endpoint.
5. Vantagem: manutenção, versionamento e integração futura ficam centralizados na mesma plataforma.

---

## Próximo passo imediato

Validar a integração ponta a ponta:
1. Enviar uma candidatura de teste pelo site.
2. Verificar se o registro aparece na tela **Comercial → Captação de Parceiros** no ERP.
3. Aprovar a candidatura de teste para confirmar que Motorista e Veículo agregado são criados corretamente.

## Entregáveis deste plano
- Snippet pronto para copiar e colar na HostGator (Opção A).
- Instruções de como migrar o site para Lovable com domínio customizado (Opção B).
- Confirmação de que a API pública já está protegida por CORS e validação de dados.
