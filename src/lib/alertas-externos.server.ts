/**
 * Envio dos alertas da central de notificações para fora do sistema:
 * - Push (Firebase Cloud Messaging) para os aparelhos do próprio usuário.
 * - Telegram para os grupos/chats da torre de controle cadastrados.
 * A fila é alimentada por gatilho em `notificacoes`; aqui só drenamos.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const TG = "https://connector-gateway.lovable.dev/telegram";
const FCM = "https://connector-gateway.lovable.dev/firebase_messaging";
const APP_URL = "https://erpg3expresso.lovable.app";

function headers(key: string | undefined) {
  const lovable = process.env.LOVABLE_API_KEY;
  if (!lovable || !key) return null;
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": key,
    "Content-Type": "application/json",
  };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function enviarTelegram(chatId: number, texto: string) {
  const h = headers(process.env.TELEGRAM_API_KEY);
  if (!h) throw new Error("Telegram não configurado");
  const r = await fetch(`${TG}/sendMessage`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!r.ok) throw new Error(`Telegram [${r.status}]: ${await r.text()}`);
}

/** Retorna false quando o token está inválido e deve ser apagado. */
async function enviarPush(token: string, titulo: string, corpo: string, link: string | null, alta: boolean) {
  const h = headers(process.env.FIREBASE_MESSAGING_API_KEY);
  if (!h) throw new Error("Firebase não configurado");
  const r = await fetch(`${FCM}/v1/projects/_/messages:send`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      message: {
        token,
        notification: { title: titulo, body: corpo },
        data: { link: link ?? "" },
        android: {
          priority: alta ? "HIGH" : "NORMAL",
          notification: { channel_id: alta ? "g3-prioritarias" : "g3-geral", color: "#F15A24" },
        },
        webpush: link ? { fcm_options: { link: `${APP_URL}${link}` } } : undefined,
      },
    }),
  });
  if (r.ok) return true;
  const txt = await r.text();
  if (r.status === 404 || (r.status === 400 && /UNREGISTERED|INVALID_ARGUMENT/.test(txt))) return false;
  throw new Error(`FCM [${r.status}]: ${txt}`);
}

type Notif = {
  id: string;
  user_id: string;
  categoria: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  origem: string | null;
  origem_id: string | null;
  prioridade: string;
};

const EMOJI: Record<string, string> = {
  monitoramento: "🚨",
  viagem: "🚚",
  documento: "📄",
  manutencao: "🔧",
  financeiro: "💰",
  sistema: "ℹ️",
};

export async function processarFilaAlertas(admin: SupabaseClient) {
  const { data: fila } = await admin
    .from("alertas_externos_fila")
    .select("id, notificacao_id, tentativas")
    .is("processado_em", null)
    .lt("tentativas", 5)
    .order("id")
    .limit(50);
  if (!fila?.length) return { processados: 0 };

  const ids = fila.map((f) => f.notificacao_id);
  const [{ data: notifs }, { data: destinos }] = await Promise.all([
    admin.from("notificacoes").select("*").in("id", ids),
    admin.from("telegram_destinos").select("*").eq("ativo", true),
  ]);
  const porId = new Map((notifs as Notif[] | null ?? []).map((n) => [n.id, n]));
  const users = [...new Set((notifs ?? []).map((n) => n.user_id))];
  const { data: tokens } = users.length
    ? await admin.from("push_tokens").select("token, user_id").in("user_id", users)
    : { data: [] as { token: string; user_id: string }[] };

  let ok = 0;
  for (const f of fila) {
    const n = porId.get(f.notificacao_id);
    const erros: string[] = [];
    if (n) {
      const alta = n.prioridade === "alta" || n.categoria === "monitoramento";
      // Push para os aparelhos do usuário
      for (const t of (tokens ?? []).filter((t) => t.user_id === n.user_id)) {
        try {
          const valido = await enviarPush(t.token, n.titulo, n.mensagem ?? "", n.link, alta);
          if (!valido) await admin.from("push_tokens").delete().eq("token", t.token);
        } catch (e) {
          erros.push((e as Error).message);
        }
      }
      // Telegram: uma vez por evento (vários usuários recebem a mesma notificação)
      const chave = `${n.tipo}|${n.origem_id ?? ""}|${n.titulo}|${n.mensagem ?? ""}`.slice(0, 500);
      for (const d of destinos ?? []) {
        if (!d.categorias.includes(n.categoria)) continue;
        if (d.somente_alta && !alta) continue;
        const { error: dup } = await admin.from("telegram_enviados").insert({ chave, chat_id: d.chat_id });
        if (dup) continue;
        const texto =
          `${EMOJI[n.categoria] ?? "ℹ️"} <b>${esc(n.titulo)}</b>` +
          (n.mensagem ? `\n${esc(n.mensagem)}` : "") +
          (n.link ? `\n\n<a href="${APP_URL}${esc(n.link)}">Abrir no sistema</a>` : "");
        try {
          await enviarTelegram(d.chat_id, texto);
        } catch (e) {
          await admin.from("telegram_enviados").delete().eq("chave", chave).eq("chat_id", d.chat_id);
          erros.push((e as Error).message);
        }
      }
    }
    const final = erros.length === 0 || f.tentativas + 1 >= 5;
    await admin
      .from("alertas_externos_fila")
      .update({
        tentativas: f.tentativas + 1,
        processado_em: final ? new Date().toISOString() : null,
        erro: erros.join(" | ").slice(0, 1000) || null,
      })
      .eq("id", f.id);
    if (!erros.length) ok++;
  }
  return { processados: fila.length, ok };
}
