/**
 * Verificação de e-mails (server-only) antes de exibir/disparar prospecção.
 *
 * Camadas de checagem, da mais barata para a mais caviar:
 *  1) Sintaxe (RFC simplificado) e tamanho.
 *  2) Domínios descartáveis / de exemplo / placeholders.
 *  3) DNS MX via DNS-over-HTTPS (dns.google) — se o domínio não aceita e-mail,
 *     o envio com certeza vai falhar, então o endereço é descartado.
 *  4) Origem: endereço extraído de fonte pública = confirmado; endereço apenas
 *     inferido por padrão corporativo = "não confirmado" (pode não existir).
 *
 * Não é possível validar a caixa postal específica em runtime serverless
 * (não há socket SMTP), por isso a distinção "confirmado x provável" é o que
 * protege a reputação do remetente.
 */

export type EmailStatus = "valido" | "nao_confirmado" | "invalido";

export type EmailVerificacao = {
  email: string;
  status: EmailStatus;
  motivo: string;
};

const SINTAXE = /^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const DOMINIOS_INVALIDOS = new Set([
  "example.com",
  "example.org",
  "email.com",
  "teste.com",
  "test.com",
  "dominio.com",
  "empresa.com",
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "yopmail.com",
  "trashmail.com",
  "linkedin.com",
  "licdn.com",
]);

const LOCAIS_INVALIDOS = /^(no-?reply|nao-?responda|postmaster|abuse|mailer-daemon|exemplo|example|seu-?email|email)$/i;

/** Cache de MX por domínio durante a vida da instância (evita repetir DNS). */
const cacheMx = new Map<string, boolean>();

async function dominioAceitaEmail(dominio: string): Promise<boolean> {
  const chave = dominio.toLowerCase();
  const cache = cacheMx.get(chave);
  if (cache !== undefined) return cache;

  const consulta = async (tipo: "MX" | "A") => {
    try {
      const res = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(chave)}&type=${tipo}`,
        { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { Status?: number; Answer?: { type?: number; data?: string }[] };
      if (json.Status !== 0) return false;
      return (json.Answer ?? []).some((a) => a.data);
    } catch {
      return null;
    }
  };

  const mx = await consulta("MX");
  // DNS indisponível (null) => não bloqueia o fluxo, trata como aceitável.
  const ok = mx === null ? true : mx || (await consulta("A")) !== false;
  cacheMx.set(chave, ok);
  return ok;
}

/**
 * Valida um e-mail. `origem: "inferido"` marca endereços montados por padrão
 * corporativo (nome.sobrenome@dominio), que existem apenas como hipótese.
 */
export async function verificarEmail(
  emailBruto: string | null | undefined,
  origem: "fonte" | "inferido" = "fonte",
): Promise<EmailVerificacao> {
  const email = (emailBruto ?? "").trim().toLowerCase();
  if (!email) return { email, status: "invalido", motivo: "E-mail não informado." };
  if (email.length > 254 || !SINTAXE.test(email)) {
    return { email, status: "invalido", motivo: "Formato de e-mail inválido." };
  }

  const [local, dominio] = email.split("@") as [string, string];
  if (LOCAIS_INVALIDOS.test(local)) {
    return { email, status: "invalido", motivo: "Endereço automático (não recebe contato comercial)." };
  }
  if (DOMINIOS_INVALIDOS.has(dominio)) {
    return { email, status: "invalido", motivo: "Domínio descartável, de exemplo ou de rede social." };
  }

  if (!(await dominioAceitaEmail(dominio))) {
    return { email, status: "invalido", motivo: `O domínio ${dominio} não possui servidor de e-mail (MX).` };
  }

  if (origem === "inferido") {
    return {
      email,
      status: "nao_confirmado",
      motivo: "Domínio válido, mas o endereço foi deduzido pelo padrão corporativo — confirme antes de enviar.",
    };
  }

  return { email, status: "valido", motivo: "Domínio com servidor de e-mail ativo e endereço obtido de fonte pública." };
}
