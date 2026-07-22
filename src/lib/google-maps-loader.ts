/// <reference types="google.maps" />
// Google Maps JS API loader (singleton).
// Uses the managed browser key from the Google Maps connector.

let loadPromise: Promise<typeof google> | null = null;

declare global {
  interface Window {
    google?: typeof google;
    __g3InitGoogleMaps?: () => void;
  }
}

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (loadPromise) return loadPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string | undefined;

  if (!key) {
    return Promise.reject(new Error("Google Maps browser key não configurado."));
  }

  loadPromise = new Promise((resolve, reject) => {
    window.__g3InitGoogleMaps = () => {
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps carregou vazio"));
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      loading: "async",
      callback: "__g3InitGoogleMaps",
      libraries: "geometry",
    });
    if (channel) params.set("channel", channel);
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(script);
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
