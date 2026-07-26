/**
 * Camada única de notificações do G3 Expresso.
 *
 * - Web: usa a Notification API do navegador.
 * - Android (Capacitor): usa @capacitor/local-notifications com canais
 *   dedicados, ícone e cor institucional.
 * - Push (FCM): a estrutura já está pronta — basta instalar
 *   @capacitor/push-notifications e preencher `registerPushToken`.
 */
import { isNative } from "@/lib/native";

export type NotifCategoria =
  | "viagem"
  | "monitoramento"
  | "documento"
  | "manutencao"
  | "financeiro"
  | "sistema";

export type NotifPrioridade = "alta" | "normal" | "baixa";

export const CATEGORIAS: { value: NotifCategoria; label: string }[] = [
  { value: "viagem", label: "Viagens" },
  { value: "monitoramento", label: "Monitoramento" },
  { value: "documento", label: "Documentos" },
  { value: "manutencao", label: "Manutenções" },
  { value: "financeiro", label: "Financeiro" },
  { value: "sistema", label: "Sistema" },
];

const BRAND_COLOR = "#F15A24";
const CHANNEL_ALTA = "g3-prioritarias";
const CHANNEL_GERAL = "g3-geral";

let channelsReady = false;
let permissionGranted: boolean | null = null;

/** Cria os canais Android (idempotente). */
async function ensureChannels() {
  if (channelsReady || !isNative()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.createChannel({
    id: CHANNEL_ALTA,
    name: "Viagens e alertas urgentes",
    description: "Viagens atribuídas, em andamento e alertas de monitoramento",
    importance: 5,
    visibility: 1,
    sound: undefined,
    vibration: true,
    lights: true,
    lightColor: BRAND_COLOR,
  });
  await LocalNotifications.createChannel({
    id: CHANNEL_GERAL,
    name: "Avisos gerais",
    description: "Documentos, manutenções e financeiro",
    importance: 3,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: BRAND_COLOR,
  });
  channelsReady = true;
}

/** Solicita permissão de notificação (nativo ou web) uma única vez. */
export async function ensureNotificationsReady(): Promise<boolean> {
  if (permissionGranted !== null) return permissionGranted;

  if (isNative()) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let status = await LocalNotifications.checkPermissions();
    if (status.display !== "granted") {
      status = await LocalNotifications.requestPermissions();
    }
    permissionGranted = status.display === "granted";
    if (permissionGranted) await ensureChannels();
    return permissionGranted;
  }

  if (typeof Notification === "undefined") {
    permissionGranted = false;
    return false;
  }
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      /* noop */
    }
  }
  permissionGranted = Notification.permission === "granted";
  return permissionGranted;
}

function notifId() {
  return Math.floor(Math.random() * 2_000_000_000);
}

/** Dispara uma notificação local no dispositivo. */
export async function notifyLocal(opts: {
  titulo: string;
  mensagem?: string | null;
  categoria?: NotifCategoria;
  prioridade?: NotifPrioridade;
  tag?: string;
  link?: string | null;
}): Promise<void> {
  const ok = await ensureNotificationsReady();
  if (!ok) return;

  const alta = opts.prioridade === "alta" || opts.categoria === "monitoramento";

  if (isNative()) {
    try {
      await ensureChannels();
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId(),
            title: opts.titulo,
            body: opts.mensagem ?? "",
            channelId: alta ? CHANNEL_ALTA : CHANNEL_GERAL,
            smallIcon: "ic_stat_notify",
            iconColor: BRAND_COLOR,
            extra: { link: opts.link ?? null, categoria: opts.categoria ?? "sistema" },
          },
        ],
      });
    } catch {
      /* noop */
    }
    return;
  }

  try {
    new Notification(opts.titulo, {
      body: opts.mensagem ?? undefined,
      tag: opts.tag,
      icon: "/favicon.ico",
    });
  } catch {
    /* noop */
  }
}

/**
 * Preparado para Firebase Cloud Messaging.
 *
 * Quando o FCM estiver configurado (google-services.json + plugin
 * @capacitor/push-notifications), basta implementar o corpo desta função:
 * registrar o listener, obter o token e gravá-lo numa tabela
 * `push_tokens` (user_id, token, plataforma). O restante do sistema
 * (categorias, canais, prioridades) já está pronto.
 */
export async function registerPushToken(): Promise<string | null> {
  return null;
}
