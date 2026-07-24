/**
 * Utilitários para detectar se o app está rodando dentro do Capacitor
 * (APK Android) e usar recursos nativos quando disponíveis.
 *
 * Todo o resto do código continua igual — os hooks web funcionam
 * normalmente. As funções abaixo apenas *preferem* a API nativa quando
 * ela existe (GPS em segundo plano, câmera nativa, notificações locais).
 */
import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // "web" | "android" | "ios"

/** Pede permissão de localização (foreground + background) no Android. */
export async function ensureLocationPermission(): Promise<boolean> {
  if (!isNative()) {
    return "geolocation" in navigator;
  }
  const { Geolocation } = await import("@capacitor/geolocation");
  const status = await Geolocation.checkPermissions();
  if (status.location === "granted") return true;
  const req = await Geolocation.requestPermissions({ permissions: ["location"] });
  return req.location === "granted";
}

/** Pede permissão de notificações locais (viagem nova, mensagens do gestor). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative()) {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
  }
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const status = await LocalNotifications.checkPermissions();
  if (status.display === "granted") return true;
  const req = await LocalNotifications.requestPermissions();
  return req.display === "granted";
}
