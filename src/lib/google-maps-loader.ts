/// <reference types="google.maps" />
// Google Maps JS API loader (singleton).
// Uses the active G3 browser key from a server config endpoint when the public connector var is unavailable.

let loadPromise: Promise<typeof google> | null = null;
const SCRIPT_ID = "g3-google-maps-js";

type GoogleMapsConfig = {
  key?: string;
  channel?: string;
};

declare global {
  interface Window {
    google?: typeof google;
    __g3InitGoogleMaps?: () => void;
    gm_authFailure?: () => void;
  }
}

async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  const connectorKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as
    | string
    | undefined;
  const connectorChannel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as
    | string
    | undefined;

  if (connectorKey) {
    return { key: connectorKey, channel: connectorChannel };
  }

  // Endpoint protegido: exige sessão válida do usuário.
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const response = await fetch("/api/google-maps-config", {
    cache: "no-store",
    credentials: "same-origin",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });


  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Configuração do Google Maps indisponível");
  }

  return (await response.json()) as GoogleMapsConfig;
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps?.Map) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  loadPromise = getGoogleMapsConfig()
    .then(({ key, channel }) => {
      if (!key) {
        throw new Error(
          "Google Maps não configurado. A conexão ativa precisa fornecer a chave GOOGLE_API_KEY.",
        );
      }

      return new Promise<typeof google>((resolve, reject) => {
        const existingScript = document.getElementById(SCRIPT_ID);
        if (existingScript) existingScript.remove();

        let settled = false;
        const cleanup = () => {
          window.__g3InitGoogleMaps = undefined;
          window.gm_authFailure = undefined;
        };
        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          document.getElementById(SCRIPT_ID)?.remove();
          cleanup();
          reject(new Error(message));
        };

        window.__g3InitGoogleMaps = () => {
          if (settled) return;
          if (window.google?.maps?.Map) {
            settled = true;
            cleanup();
            resolve(window.google);
            return;
          }
          fail("Google Maps carregou vazio");
        };

        window.gm_authFailure = () => {
          fail(
            "Google Maps bloqueou a chave ativa. Se o console mostrar ApiTargetBlockedMapError, habilite Maps JavaScript API nas restrições da chave GOOGLE_API_KEY.",
          );
        };

        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        const params = new URLSearchParams({
          key,
          loading: "async",
          callback: "__g3InitGoogleMaps",
          libraries: "geometry,places",
          language: "pt-BR",
          region: "BR",
          v: "weekly",
        });
        if (channel) params.set("channel", channel);
        script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => fail("Falha ao baixar o Google Maps");
        document.head.appendChild(script);
      });
    })
    .catch((error) => {
      loadPromise = null;
      throw error;
    });

  return loadPromise;
}

// Ícone SVG de caminhão laranja G3.
export function truckIcon(color = "#F15A24"): google.maps.Symbol | google.maps.Icon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="20" fill="${color}" stroke="white" stroke-width="3"/>
      <g fill="white" transform="translate(9,11)">
        <path d="M2 3h14v10H2z" opacity=".95"/>
        <path d="M16 6h6l4 4v3h-10z"/>
        <circle cx="7" cy="15" r="2.4" fill="#141414"/>
        <circle cx="20" cy="15" r="2.4" fill="#141414"/>
      </g>
    </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(44, 44),
    anchor: new google.maps.Point(22, 22),
  };
}
