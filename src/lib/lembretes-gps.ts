/**
 * Lembretes de localização para o motorista.
 *
 * Enquanto existe viagem em andamento sem envio de posição, o app agenda no
 * próprio Android uma sequência de avisos a cada 5 minutos. Como o
 * agendamento fica no sistema operacional, o motorista continua sendo avisado
 * mesmo com o aplicativo fechado ou sem internet — e os avisos são cancelados
 * assim que a posição volta a chegar.
 */
import { isNative } from "@/lib/native";
import { BRAND_COLOR, CHANNEL_ALTA } from "@/lib/notifications";

/** Faixa de IDs reservada para estes lembretes. */
const BASE_ID = 910_000;
const SLOTS = 12; // 1 hora de lembretes (a cada 5 minutos)
const INTERVALO_MS = 5 * 60_000;

const ids = Array.from({ length: SLOTS }, (_, i) => ({ id: BASE_ID + i }));

/** Reagenda a sequência completa de lembretes a partir de agora. */
export async function agendarLembretesGps(critico = false): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return;
    await LocalNotifications.cancel({ notifications: ids });
    const agora = Date.now();
    await LocalNotifications.schedule({
      notifications: ids.map((n, i) => ({
        id: n.id,
        title: critico
          ? "Sua localização está sem sinal há mais de 20 minutos"
          : "Localização não está sendo enviada",
        body: "Abra o app da G3 e mantenha a localização ativa para a operação acompanhar sua viagem.",
        channelId: CHANNEL_ALTA,
        smallIcon: "ic_stat_notify",
        iconColor: BRAND_COLOR,
        schedule: { at: new Date(agora + (i + 1) * INTERVALO_MS), allowWhileIdle: true },
        extra: { categoria: "monitoramento", link: "/app" },
      })),
    });
  } catch {
    /* aparelho sem permissão ou plugin indisponível */
  }
}

/** Cancela os lembretes (posição voltou a chegar ou viagem terminou). */
export async function cancelarLembretesGps(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: ids });
  } catch {
    /* noop */
  }
}
