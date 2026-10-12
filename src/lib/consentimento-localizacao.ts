/** Consentimento da Declaração em Destaque (Google Play) para localização em segundo plano. */
const KEY = "g3:bg-location-consent";
const REFUSAL_KEY = "g3:bg-location-refusal";
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

/** A recusa vale para a viagem atual (viagensKey): só pergunta de novo na próxima viagem. */
function recusaDaViagem(viagensKey: string): boolean {
  try {
    return localStorage.getItem(REFUSAL_KEY) === viagensKey;
  } catch {
    return false;
  }
}

/**
 * Abre o modal (se ainda não aceito) e aguarda a resposta do motorista.
 * Se o motorista já recusou nesta viagem (mesma viagensKey), resolve false
 * sem reabrir o modal — a pergunta só volta quando o conjunto de viagens muda.
 */
/** Chave da viagem que disparou o pedido atual — usada para gravar a recusa. */
let chaveAtual = "";

export function garantirConsentimento(viagensKey = ""): Promise<boolean> {
  if (consentimentoAceito()) return Promise.resolve(true);
  if (viagensKey && recusaDaViagem(viagensKey)) return Promise.resolve(false);
  if (pendente) return pendente;
  chaveAtual = viagensKey;
  pendente = new Promise<boolean>((res) => {
    resolver = res;
  });
  window.dispatchEvent(new Event(EVENT));
  return pendente;
}

export function responderConsentimento(aceitou: boolean) {
  try {
    if (aceitou) {
      localStorage.setItem(KEY, "aceito");
      localStorage.removeItem(REFUSAL_KEY);
    } else if (chaveAtual) {
      localStorage.setItem(REFUSAL_KEY, chaveAtual);
    }
  } catch {
    /* noop */
  }
  resolver?.(aceitou);
  resolver = null;
  pendente = null;
}

export const EVENTO_CONSENTIMENTO = EVENT;
