/** Consentimento da Declaração em Destaque (Google Play) para localização em segundo plano. */
const KEY = "g3:bg-location-consent";
const EVENT = "g3:pedir-consentimento-localizacao";

type Resolver = (aceitou: boolean) => void;
let pendente: Promise<boolean> | null = null;
let resolver: Resolver | null = null;

export function consentimentoAceito(): boolean {
  try {
    return localStorage.getItem(KEY) === "aceito";
  } catch {
    return false;
  }
}

/** Abre o modal (se ainda não aceito) e aguarda a resposta do motorista. */
export function garantirConsentimento(): Promise<boolean> {
  if (consentimentoAceito()) return Promise.resolve(true);
  if (pendente) return pendente;
  pendente = new Promise<boolean>((res) => {
    resolver = res;
  });
  window.dispatchEvent(new Event(EVENT));
  return pendente;
}

export function responderConsentimento(aceitou: boolean) {
  try {
    if (aceitou) localStorage.setItem(KEY, "aceito");
  } catch {
    /* noop */
  }
  resolver?.(aceitou);
  resolver = null;
  pendente = null;
}

export const EVENTO_CONSENTIMENTO = EVENT;
