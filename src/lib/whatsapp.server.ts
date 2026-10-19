// Núcleo do WhatsApp Business (somente servidor). Envio pelo gateway do conector,
// registro das mensagens e processamento idempotente dos webhooks recebidos.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
const GATEWAY = "https://connector-gateway.lovable.dev/whatsapp";
const SITE = "https://erpg3expresso.lovable.app";
const TZ = "America/Sao_Paulo";

export const EVENTOS_WHATSAPP = [
  { id: "inicio_viagem", label: "Início de viagem" },
  { id: "a_caminho", label: "Saída para próxima entrega" },
  { id: "entrega_concluida", label: "Entrega concluída" },
  { id: "fim_viagem", label: "Fim de viagem" },
  { id: "zona_risco", label: "Zona de risco" },
  { id: "alerta_motorista", label: "Alertas do motorista" },
  { id: "posicao", label: "Responder posição atual" },
] as const;
export type EventoWhatsApp = (typeof EVENTOS_WHATSAPP)[number]["id"];

export function normalizarTelefone(t: string): string {
  let d = (t || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

function creds() {
  const a = process.env["LOVABLE_API_KEY"];
  const b = process.env["WHATSAPP_API_KEY"];
  if (!a) throw new Error("LOVABLE_API_KEY não configurada");
  if (!b) throw new Error("WHATSAPP_API_KEY não configurada");
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": "application/json" };
}

/** Parâmetro de modelo não aceita quebra de linha nem muitos espaços seguidos. */
const paramModelo = (s: string) => s.replace(/\s*\n+\s*/g, " · ").replace(/\s{2,}/g, " ").slice(0, 900);

async function janelaAberta(admin: Admin, tel: string) {
  const desde = new Date(Date.now() - 23.5 * 3600_000).toISOString();
  const { data } = await admin
    .from("whatsapp_mensagens")
    .select("id")
    .eq("telefone", tel)
    .eq("direcao", "entrada")
    .gte("created_at", desde)
    .limit(1);
  return !!data?.length;
}

const RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

/** Aplica os retornos de status guardados para uma mensagem (seguro para repetir). */
export async function reconciliarStatus(admin: Admin, wamid: string) {
  const [{ data: msg }, { data: evs }] = await Promise.all([
    admin.from("whatsapp_mensagens").select("id, status, status_em").eq("wamid", wamid).maybeSingle(),
    admin.from("whatsapp_status_eventos").select("status, ocorrido_em, erros").eq("wamid", wamid),
  ]);
  if (!msg || !evs?.length) return false;
  const statusEm = { ...((msg.status_em as Record<string, string>) ?? {}) };
  let status = msg.status;
  let erro: string | null = null;
  for (const e of evs) {
    if (!statusEm[e.status]) statusEm[e.status] = e.ocorrido_em;
    // "failed" só vale se ainda não foi lida/entregue.
    if (e.status === "failed" && (RANK[status] ?? 0) >= 2) continue;
    if ((RANK[e.status] ?? 0) > (RANK[status] ?? 0)) status = e.status;
    if (e.status === "failed") erro = JSON.stringify(e.erros ?? []);
  }
  const { error } = await admin
    .from("whatsapp_mensagens")
    .update({ status, status_em: statusEm, ...(erro ? { erro } : {}) })
    .eq("id", msg.id);
  if (error) throw new Error(error.message);
  return true;
}

type EnvioOpts = {
  para: string;
  texto: string;
  /** Modelo usado fora da janela de 24h. */
  modelo?: { nome: string; params: string[] };
  evento?: string | null;
  viagemId?: string | null;
  motoristaId?: string | null;
  clienteId?: string | null;
};

/** Envia uma mensagem: texto livre na janela de 24h, senão modelo aprovado. */
export async function enviarWhatsApp(admin: Admin, o: EnvioOpts) {
  const tel = normalizarTelefone(o.para);
  const aberta = await janelaAberta(admin, tel);
  const modelo = o.modelo ?? { nome: "g3_aviso_operacao", params: [o.texto] };
  const body = aberta
    ? { messaging_product: "whatsapp", to: tel, type: "text", text: { body: o.texto.slice(0, 4000) } }
    : {
        messaging_product: "whatsapp",
        to: tel,
        type: "template",
        template: {
          name: modelo.nome,
          language: { code: "pt_BR" },
          components: [{ type: "body", parameters: modelo.params.map((p) => ({ type: "text", text: paramModelo(p) })) }],
        },
      };
  let wamid: string | null = null;
  let erro: string | null = null;
  try {
    const r = await fetch(`${GATEWAY}/messages`, { method: "POST", headers: creds(), body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) erro = `[${r.status}] ${txt.slice(0, 800)}`;
    else wamid = (JSON.parse(txt) as { messages?: { id: string }[] }).messages?.[0]?.id ?? null;
  } catch (e) {
    erro = (e as Error).message;
  }
  const { error } = await admin.from("whatsapp_mensagens").insert({
    direcao: "saida",
    telefone: tel,
    wamid,
    tipo: aberta ? "text" : "template",
    texto: o.texto,
    evento: o.evento ?? null,
    status: wamid ? "accepted" : "failed",
    erro,
    viagem_id: o.viagemId ?? null,
    motorista_id: o.motoristaId ?? null,
    cliente_id: o.clienteId ?? null,
  });
  if (error) console.error("whatsapp_mensagens insert", error.message);
  if (wamid) await reconciliarStatus(admin, wamid).catch(() => {});
  return { wamid, erro };
}

async function linkRastreio(admin: Admin, viagemId: string, userId: string | null) {
  const { data: ex } = await admin
    .from("viagem_compartilhamentos")
    .select("token")
    .eq("viagem_id", viagemId)
    .is("revogado_em", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (ex?.token) return `${SITE}/rastreio/${ex.token}`;
  if (!userId) return null;
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const A = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const token = Array.from(bytes, (b) => A[b % A.length]).join("");
  const { error } = await admin.from("viagem_compartilhamentos").insert({ viagem_id: viagemId, token, created_by: userId });
  return error ? null : `${SITE}/rastreio/${token}`;
}

async function dadosViagem(admin: Admin, viagemId: string) {
  const { data: v } = await admin
    .from("viagens")
    .select("id, codigo, cliente_id, motorista_id, veiculo_id, destino_cidade, destino_uf")
    .eq("id", viagemId)
    .maybeSingle();
  if (!v) return null;
  const [{ data: m }, { data: ve }] = await Promise.all([
    v.motorista_id ? admin.from("motoristas").select("nome, user_id").eq("id", v.motorista_id).maybeSingle() : Promise.resolve({ data: null }),
    v.veiculo_id ? admin.from("veiculos").select("placa").eq("id", v.veiculo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { ...v, motoristaNome: m?.nome ?? "MOTORISTA", motoristaUserId: m?.user_id ?? null, placa: ve?.placa ?? "" };
}

const horaSP = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** Despachante único dos avisos de viagem: resolve destinatários e envia. */
export async function dispararEvento(
  admin: Admin,
  p: { viagemId: string; evento: EventoWhatsApp; detalhe?: string | null; userId: string | null },
) {
  const v = await dadosViagem(admin, p.viagemId);
  if (!v) return { enviados: 0 };
  const link = await linkRastreio(admin, v.id, p.userId);
  const quem = `${v.motoristaNome}${v.placa ? ` (${v.placa})` : ""}`;
  const det = p.detalhe ? ` ${p.detalhe}` : "";
  const textos: Record<EventoWhatsApp, string> = {
    inicio_viagem: `Viagem iniciada às ${horaSP()} — motorista ${quem}.${det}`,
    a_caminho: `O motorista ${quem} está a caminho da próxima entrega:${det || " próximo cliente"}.`,
    entrega_concluida: `Entrega concluída às ${horaSP()}:${det || " cliente"} — motorista ${quem}.`,
    fim_viagem: `Viagem finalizada às ${horaSP()} — motorista ${quem}.${det}`,
    zona_risco: `Atenção: o veículo de ${quem} está passando por zona de risco.${det}`,
    alerta_motorista: `ALERTA do motorista ${quem}:${det}`,
    posicao: `Posição atual de ${quem}.${det}`,
  };
  const texto = `${textos[p.evento]}${link ? `\nAcompanhe: ${link}` : ""}`;

  const [{ data: internos }, { data: contatos }] = await Promise.all([
    admin.from("whatsapp_contatos_internos").select("telefone").eq("ativo", true),
    v.cliente_id
      ? admin
          .from("cliente_contatos_whatsapp")
          .select("telefone")
          .eq("cliente_id", v.cliente_id)
          .eq("ativo", true)
          .contains("eventos", [p.evento])
      : Promise.resolve({ data: [] as { telefone: string }[] }),
  ]);
  const internosTel = (internos ?? []).map((i) => normalizarTelefone(i.telefone));
  const destinos = new Map<string, string | null>();
  for (const t of internosTel) destinos.set(t, null);
  for (const c of contatos ?? []) destinos.set(normalizarTelefone(c.telefone), v.cliente_id);
  let enviados = 0;
  for (const [tel, clienteId] of destinos) {
    const r = await enviarWhatsApp(admin, {
      para: tel,
      texto,
      evento: p.evento,
      viagemId: v.id,
      motoristaId: v.motorista_id,
      clienteId,
    });
    if (r.wamid) enviados++;
  }
  return { enviados, destinos: destinos.size };
}

/** Mensagem do motorista no chat → WhatsApp do destino escolhido. */
export async function enviarChatParaWhatsApp(
  admin: Admin,
  p: { motoristaId: string; viagemId: string | null; telefones: string[]; texto: string; quem: string },
) {
  const corpo = `🚚 ${p.quem}: ${p.texto}`;
  let primeiro: string | null = null;
  const erros: string[] = [];
  for (const t of p.telefones) {
    const r = await enviarWhatsApp(admin, {
      para: t,
      texto: corpo,
      modelo: { nome: "g3_chat_motorista", params: [p.quem, p.texto] },
      evento: "chat_motorista",
      viagemId: p.viagemId,
      motoristaId: p.motoristaId,
    });
    if (r.wamid) primeiro ??= r.wamid;
    if (r.erro) erros.push(r.erro);
  }
  return { wamid: primeiro, erro: primeiro ? null : erros[0] ?? "Nenhum destinatário" };
}

// ---------------- Webhook ----------------

type MetaMsg = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  context?: { id?: string };
  image?: { caption?: string };
  button?: { text?: string };
};
type MetaStatus = { id: string; status: string; timestamp?: string; errors?: unknown[] };

function valor(payload: unknown) {
  const p = payload as { entry?: { changes?: { value?: Record<string, unknown> }[] }[] };
  return p.entry?.[0]?.changes?.[0]?.value ?? {};
}

const PERGUNTA_POSICAO = /(onde|posi[cç]|localiza|previs|chega|demora|est[aá] (vindo|chegando)|quanto tempo)/i;

function foraDoExpediente() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "2-digit", hour12: false, timeZone: TZ }));
  const dia = new Date().toLocaleString("en-US", { weekday: "short", timeZone: TZ });
  return h < 7 || h >= 19 || dia === "Sun";
}

async function respostaPosicao(admin: Admin, tel: string) {
  const { data: cts } = await admin
    .from("cliente_contatos_whatsapp")
    .select("cliente_id, eventos")
    .eq("telefone", tel)
    .eq("ativo", true);
  const clientes = (cts ?? []).filter((c) => c.eventos.includes("posicao")).map((c) => c.cliente_id);
  if (!clientes.length) return null;
  const { data: viagens } = await admin
    .from("viagens")
    .select("id")
    .in("cliente_id", clientes)
    .eq("status", "em_andamento")
    .limit(3);
  if (!viagens?.length) return "No momento não há viagem em andamento para a sua operação. Nossa equipe vai te responder em instantes.";
  const partes: string[] = [];
  for (const vg of viagens) {
    const v = await dadosViagem(admin, vg.id);
    if (!v) continue;
    const [{ data: pos }, { data: prox }] = await Promise.all([
      admin.from("viagem_localizacoes").select("latitude, longitude, created_at").eq("viagem_id", v.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("viagem_paradas").select("cliente, endereco, a_caminho_em").eq("viagem_id", v.id).is("entregue_em", null).order("ordem").limit(5),
    ]);
    const destino = (prox ?? []).find((x) => x.a_caminho_em) ?? prox?.[0];
    const link = await linkRastreio(admin, v.id, null);
    const quando = pos ? new Date(pos.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : null;
    partes.push(
      [
        `Motorista ${v.motoristaNome}${v.placa ? ` (${v.placa})` : ""}`,
        pos ? `Última posição às ${quando}: https://www.google.com/maps?q=${pos.latitude},${pos.longitude}` : "Posição ainda não recebida.",
        destino ? `Próxima entrega: ${destino.cliente || destino.endereco}` : null,
        link ? `Acompanhe ao vivo: ${link}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return partes.join("\n\n");
}

async function processarMensagem(admin: Admin, m: MetaMsg) {
  const tel = normalizarTelefone(m.from);
  const texto = m.text?.body ?? m.button?.text ?? m.image?.caption ?? `[${m.type}]`;
  const { data: existente } = await admin.from("whatsapp_mensagens").select("id").eq("wamid", m.id).maybeSingle();
  if (!existente) {
    const { error } = await admin.from("whatsapp_mensagens").insert({
      direcao: "entrada",
      telefone: tel,
      wamid: m.id,
      contexto_wamid: m.context?.id ?? null,
      tipo: m.type,
      texto,
      status: "received",
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
  }

  // 1) Resposta a uma conversa de motorista? (citação ou conversa mais recente em 24h)
  let alvo: { motorista_id: string | null; viagem_id: string | null } | null = null;
  if (m.context?.id) {
    const { data } = await admin.from("whatsapp_mensagens").select("motorista_id, viagem_id").eq("wamid", m.context.id).eq("evento", "chat_motorista").maybeSingle();
    alvo = data;
  }
  if (!alvo) {
    const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await admin
      .from("whatsapp_mensagens")
      .select("motorista_id, viagem_id")
      .eq("telefone", tel)
      .eq("direcao", "saida")
      .eq("evento", "chat_motorista")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    alvo = data;
  }
  if (alvo?.motorista_id) {
    const { data: ja } = await admin.from("motorista_chat_mensagens").select("id").eq("wamid", m.id).maybeSingle();
    if (!ja) {
      const [{ data: interno }, { data: contato }] = await Promise.all([
        admin.from("whatsapp_contatos_internos").select("nome").eq("telefone", tel).maybeSingle(),
        admin.from("cliente_contatos_whatsapp").select("id, nome").eq("telefone", tel).limit(1).maybeSingle(),
      ]);
      const { error } = await admin.from("motorista_chat_mensagens").insert({
        motorista_id: alvo.motorista_id,
        viagem_id: alvo.viagem_id,
        destino: interno ? "g3" : "monitor",
        contato_id: interno ? null : contato?.id ?? null,
        telefone: tel,
        contato_nome: interno?.nome ?? contato?.nome ?? tel,
        autor: interno ? "equipe" : "contato",
        texto,
        wamid: m.id,
      });
      if (error) throw new Error(error.message);
      const { data: mot } = await admin.from("motoristas").select("user_id").eq("id", alvo.motorista_id).maybeSingle();
      if (mot?.user_id) {
        await admin.from("notificacoes").insert({
          user_id: mot.user_id,
          tipo: "chat",
          titulo: `Nova mensagem de ${interno?.nome ?? contato?.nome ?? "contato"}`,
          mensagem: texto.slice(0, 200),
          categoria: "chat",
          prioridade: "alta",
          link: "/app/chat",
          origem: "whatsapp",
        });
      }
    }
    return;
  }

  if (existente) return; // já respondida numa entrega anterior

  // 2) Resposta automática de posição para monitores cadastrados.
  if (PERGUNTA_POSICAO.test(texto)) {
    const r = await respostaPosicao(admin, tel);
    if (r) {
      await enviarWhatsApp(admin, { para: tel, texto: r, evento: "auto_posicao" });
      return;
    }
  }
  // 3) Fora do expediente: confirma recebimento (no máximo 1x a cada 12h).
  if (foraDoExpediente()) {
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { data: ja } = await admin.from("whatsapp_mensagens").select("id").eq("telefone", tel).eq("evento", "auto_expediente").gte("created_at", desde).limit(1);
    if (!ja?.length) {
      await enviarWhatsApp(admin, {
        para: tel,
        texto: "Olá! Recebemos sua mensagem na G3 Expresso. Nosso atendimento é de segunda a sábado, das 7h às 19h, e vamos te responder assim que possível. Para saber a posição da sua carga, pergunte \"onde está?\".",
        evento: "auto_expediente",
      });
    }
  }
}

async function processarStatus(admin: Admin, s: MetaStatus) {
  const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();
  const { error } = await admin
    .from("whatsapp_status_eventos")
    .upsert({ wamid: s.id, status: s.status, ocorrido_em: ts, erros: (s.errors ?? null) as never }, { onConflict: "wamid,status", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await reconciliarStatus(admin, s.id); // se a mensagem ainda não foi salva, aplica depois no envio
}

export async function processarEvento(admin: Admin, row: { id: string; event: string; payload: unknown; attempts: number }) {
  try {
    const v = valor(row.payload) as { messages?: MetaMsg[]; statuses?: MetaStatus[] };
    if (row.event === "whatsapp.message") for (const m of v.messages ?? []) await processarMensagem(admin, m);
    else if (row.event === "whatsapp.status") for (const s of v.statuses ?? []) await processarStatus(admin, s);
    const { error } = await admin
      .from("whatsapp_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null, attempts: row.attempts + 1 })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    const tentativas = row.attempts + 1;
    await admin
      .from("whatsapp_webhook_events")
      .update({
        processing_error: (e as Error).message.slice(0, 1000),
        attempts: tentativas,
        next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** tentativas) * 60_000).toISOString(),
      })
      .eq("id", row.id);
    return false;
  }
}

/** Recupera eventos pendentes (fila justa: próximos a vencer, poucos por chamada). */
export async function recuperarPendentes(admin: Admin, limite = 5) {
  const { data } = await admin
    .from("whatsapp_webhook_events")
    .select("id, event, payload, attempts")
    .is("processed_at", null)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(limite);
  for (const r of data ?? []) await processarEvento(admin, r);
}
