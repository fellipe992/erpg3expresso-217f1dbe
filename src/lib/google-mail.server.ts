const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const FROM_EMAIL = "fellipe@g3expresso.com.br";
const FROM_NAME = "Fellipe Chaves | G3 Expresso";

type SendGoogleMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function cleanAddress(value: string) {
  return value.replace(/[\r\n]/g, "").trim();
}

function createRawMessage({ to, subject, html, text }: SendGoogleMailInput) {
  const boundary = `g3_${crypto.randomUUID()}`;
  return [
    `From: ${FROM_NAME} <${FROM_EMAIL}>`,
    `Reply-To: ${FROM_EMAIL}`,
    `To: ${cleanAddress(to)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64"),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    `--${boundary}--`,
  ].join("\r\n");
}

export async function sendGoogleMail(input: SendGoogleMailInput): Promise<{ messageId: string }> {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableApiKey || !connectionKey) {
    throw new Error("A conta de e-mail da G3 não está conectada ao sistema.");
  }

  const response = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": connectionKey,
    },
    body: JSON.stringify({ raw: base64Url(createRawMessage(input)) }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    console.error(`Gmail request failed [${response.status}]: ${responseText}`);
    if (response.status === 401 || response.status === 403) {
      throw new Error("A autorização do Gmail expirou ou não permite enviar e-mails.");
    }
    if (response.status === 429) {
      throw new Error("O limite de envios da conta Google foi atingido. Tente novamente mais tarde.");
    }
    throw new Error(`O Gmail recusou o envio (${response.status}).`);
  }

  const result = JSON.parse(responseText) as { id?: string };
  if (!result.id) throw new Error("O Gmail não confirmou o envio da mensagem.");
  return { messageId: result.id };
}