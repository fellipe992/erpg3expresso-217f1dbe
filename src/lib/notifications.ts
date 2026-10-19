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

export const BRAND_COLOR = "#F15A24";
export const CHANNEL_ALTA = "g3-prioritarias";
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

export type PushResultado =
  | { status: "registered"; token: string }
  | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" | "error"; detalhe?: string };

async function salvarToken(token: string, plataforma: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase
    .from("push_tokens")
    .upsert(
      { user_id: data.user.id, token, plataforma, atualizado_em: new Date().toISOString() },
      { onConflict: "token" },
    );
}

/**
 * Registra este aparelho no Firebase Cloud Messaging e grava o token.
 * Android (app): plugin nativo — requer google-services.json no projeto Android.
 * Navegador: precisa ser chamado a partir de um clique.
 */
export async function registerPushToken(): Promise<PushResultado> {
  try {
    if (isNative()) {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") return { status: "denied" };
      await ensureChannels();
      const token = await new Promise<string>((resolve, reject) => {
        void PushNotifications.addListener("registration", (t) => resolve(t.value));
        void PushNotifications.addListener("registrationError", (e) => reject(new Error(e.error)));
        void PushNotifications.register();
        setTimeout(() => reject(new Error("Tempo esgotado ao registrar")), 15000);
      });
      await salvarToken(token, "android");
      return { status: "registered", token };
    }

    const appId = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID as string | undefined;
    const vapidKey = import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY as string | undefined;
    const config = {
      apiKey: (import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY as string | undefined) ?? "",
      projectId: (import.meta.env.VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID as string | undefined) ?? "",
      appId: appId ?? "",
      messagingSenderId: appId?.split(":")[1] ?? "",
    };
    if (!config.apiKey || !config.projectId || !appId || !vapidKey || !config.messagingSenderId) {
      return { status: "not-configured" };
    }
    const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
    if (!("Notification" in window) || !(await isSupported())) return { status: "unsupported" };
    if (window.top !== window.self) return { status: "open-in-new-tab" };
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return { status: "denied" };
    const { initializeApp, getApps } = await import("firebase/app");
    const app = getApps()[0] ?? initializeApp(config);
    const reg = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${new URLSearchParams(config).toString()}`,
    );
    const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
    if (!token) return { status: "denied" };
    await salvarToken(token, "web");
    return { status: "registered", token };
  } catch (e) {
    return { status: "error", detalhe: (e as Error).message };
  }
}
