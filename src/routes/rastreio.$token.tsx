import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Loader2, MapPin, PackageCheck } from "lucide-react";
import g3Logo from "@/assets/g3-expresso-logo.png.asset.json";

export const Route = createFileRoute("/rastreio/$token")({
  head: () => ({
    meta: [
      { title: "Acompanhe sua entrega — G3 Expresso" },
      {
        name: "description",
        content: "Acompanhe em tempo real, no mapa, a posição atual do veículo que leva sua carga.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Acompanhe sua entrega — G3 Expresso" },
      {
        property: "og:description",
        content: "Mapa com a posição atual do veículo que leva sua carga.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RastreioPublico,
});

type Posicao = {
  status: "ativo" | "encerrado" | "aguardando" | "invalido";
  latitude?: number;
  longitude?: number;
  atualizadoEm?: string;
};

function RastreioPublico() {
  const { token } = Route.useParams();

  const { data, isLoading } = useQuery<Posicao>({
    queryKey: ["rastreio-publico", token],
    refetchInterval: 20_000,
    queryFn: async () => {
      const res = await fetch(`/api/public/rastreio/${token}`);
      return (await res.json()) as Posicao;
    },
  });

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <img src={g3Logo.url} alt="G3 Expresso" className="h-8 w-auto object-contain" />
        <div className="text-right">
          <h1 className="text-sm font-semibold">Acompanhe sua entrega</h1>
          <p className="text-[11px] text-muted-foreground">
            {data?.status === "ativo" && data.atualizadoEm
              ? `Atualizado às ${new Date(data.atualizadoEm).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "America/Sao_Paulo",
                })}`
              : "Posição em tempo real"}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        {isLoading && (
          <div className="absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-brand" />
          </div>
        )}

        {!isLoading && data?.status === "ativo" && data.latitude != null && data.longitude != null && (
          <ClientOnly fallback={null}>
            <Mapa lat={data.latitude} lng={data.longitude} />
          </ClientOnly>
        )}

        {!isLoading && data?.status === "aguardando" && (
          <Aviso
            icon={MapPin}
            titulo="Aguardando a primeira posição"
            texto="O veículo iniciou a viagem e a posição aparece aqui em instantes."
          />
        )}

        {!isLoading && data?.status === "encerrado" && (
          <Aviso icon={PackageCheck} titulo="Entrega finalizada" texto="Este acompanhamento foi encerrado." />
        )}

        {!isLoading && (!data || data.status === "invalido") && (
          <Aviso
            icon={MapPin}
            titulo="Link indisponível"
            texto="Este link de acompanhamento não é mais válido."
          />
        )}
      </div>

      <footer className="border-t border-border/60 px-4 py-2 text-center text-[11px] text-muted-foreground">
        A posição é atualizada automaticamente a cada 20 segundos.
      </footer>
    </main>
  );
}

function Aviso({
  icon: Icon,
  titulo,
  texto,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-xs text-center">
        <Icon className="mx-auto mb-3 size-8 text-brand" />
        <h2 className="font-display text-lg font-bold">{titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}

/** Mapa aberto (OpenStreetMap) — não expõe nenhuma chave de API. */
function Mapa({ lat, lng }: { lat: number; lng: number }) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelado || !divRef.current) return;

      if (!mapRef.current) {
        const map = L.map(divRef.current).setView([lat, lng], 14);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);
        markerRef.current = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:34px;height:34px;border-radius:9999px;background:#f97316;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;font-size:16px">🚚</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
        }).addTo(map);
        mapRef.current = map;
      } else {
        mapRef.current.panTo([lat, lng]);
        markerRef.current?.setLatLng([lat, lng]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [lat, lng]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={divRef} className="absolute inset-0" />;
}
