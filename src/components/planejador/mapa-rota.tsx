/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { Loader2, MapPin } from "lucide-react";

export function MapaRota({ polyline, pontos }: { polyline: string; pontos: string[] }) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const lineRef = useRef<google.maps.Polyline | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (!polyline) return;
    setCarregando(true);
    loadGoogleMaps()
      .then((google) => {
        if (cancelado || !divRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(divRef.current, {
            center: { lat: -15.78, lng: -47.93 },
            zoom: 5,
            streetViewControl: false,
            mapTypeControl: false,
          });
        }
        const path = google.maps.geometry.encoding.decodePath(polyline);
        lineRef.current?.setMap(null);
        lineRef.current = new google.maps.Polyline({
          path,
          strokeColor: "#F15A24",
          strokeOpacity: 0.95,
          strokeWeight: 5,
          map: mapRef.current,
        });

        markersRef.current.forEach((m) => m.setMap(null));
        markersRef.current = [];
        const total = pontos.length;
        const posicoes = pontos.map((_, i) =>
          path[Math.round((i / Math.max(1, total - 1)) * (path.length - 1))],
        );
        posicoes.forEach((pos, i) => {
          if (!pos) return;
          markersRef.current.push(
            new google.maps.Marker({
              position: pos,
              map: mapRef.current!,
              label: {
                text: i === 0 ? "A" : i === total - 1 ? "B" : String(i),
                color: "#ffffff",
                fontSize: "12px",
              },
              title: pontos[i],
            }),
          );
        });

        const bounds = new google.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        mapRef.current.fitBounds(bounds, 40);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar o mapa"))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [polyline, pontos]);

  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-xl border border-border/60 md:h-[460px]">
      <div ref={divRef} className="size-full" />
      {(!polyline || erro) && (
        <div className="absolute inset-0 grid place-items-center bg-muted/60 p-6 text-center text-sm text-muted-foreground">
          <div className="space-y-2">
            <MapPin className="mx-auto size-6 text-brand" />
            <p>{erro ?? "Informe origem e destino e clique em Calcular para ver a rota."}</p>
          </div>
        </div>
      )}
      {carregando && (
        <div className="absolute right-3 top-3 rounded-full bg-background/90 p-2 shadow">
          <Loader2 className="size-4 animate-spin text-brand" />
        </div>
      )}
    </div>
  );
}
