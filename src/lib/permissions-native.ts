import { Capacitor, registerPlugin } from "@capacitor/core";

interface G3PermissionsNativas {
  ensureMicrophone(): Promise<{ granted: boolean }>;
  isMicrophoneGranted(): Promise<{ granted: boolean }>;
  openSettings(): Promise<void>;
}

const G3Permissions = registerPlugin<G3PermissionsNativas>("G3Permissions");

export const estaNoApp = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * Pede a permissão do microfone ao Android (a janela do sistema).
 * "concedida" = pode gravar; "negada" = o usuário bloqueou;
 * "indisponivel" = APK antiga sem o plugin nativo (segue o caminho do navegador).
 */
export async function garantirMicrofone(): Promise<"concedida" | "negada" | "indisponivel"> {
  if (!estaNoApp()) return "indisponivel";
  try {
    const r = await G3Permissions.ensureMicrophone();
    return r?.granted ? "concedida" : "negada";
  } catch {
    return "indisponivel";
  }
}

/** Abre Ajustes > Apps > G3 Motorista para o usuário liberá-lo na mão. */
export async function abrirConfiguracoesApp(): Promise<boolean> {
  if (!estaNoApp()) return false;
  try {
    await G3Permissions.openSettings();
    return true;
  } catch {
    return false;
  }
}

export type ErroMicrofone = { texto: string; abrirAjustes: boolean };

/** Regra única de mensagem: o que dizer para cada motivo de falha do microfone. */
export function classificarErroMicrofoneNome(nome: string, noApp: boolean): ErroMicrofone {
  switch (nome) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return {
        texto: noApp
          ? "O microfone está bloqueado para o app. Toque em Ajustes e permita o uso."
          : "O navegador bloqueou o microfone. Libere o acesso no cadeado da barra de endereço.",
        abrirAjustes: noApp,
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return { texto: "Nenhum microfone encontrado neste aparelho.", abrirAjustes: false };
    case "NotReadableError":
    case "AbortError":
      return {
        texto: "O microfone está sendo usado por outro app. Feche esse app e tente de novo.",
        abrirAjustes: false,
      };
    default:
      return { texto: "Não consegui ligar o microfone. Tente de novo.", abrirAjustes: false };
  }
}

export function classificarErroMicrofone(e: unknown, noApp: boolean = estaNoApp()): ErroMicrofone {
  const nome = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
  return classificarErroMicrofoneNome(nome, noApp);
}
