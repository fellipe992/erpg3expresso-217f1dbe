/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Route as RouteIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleMaps, truckIcon } from "@/lib/google-maps-loader";

type Props = {
  viagemId: string;
};

type Point = {
  id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  velocidade: number | null;
};

type RouteEvent = {
  point: Point;
  distanceKm: number;
  elapsedMin: number;
};

function haversineKm(a: Point, b: Point) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function RotaViagemButton({ viagemId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState<Point[]>([]);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const startMarkerRef = useRef<google.maps.Marker | null>(null);
  const currentMarkerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("viagem_localizacoes")
      .select("id, latitude, longitude, created_at, velocidade")
      .eq("viagem_id", viagemId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setPoints((data ?? []) as Point[]);
        setLoading(false);
      });
  }, [open, viagemId]);

  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel(`rota-viagem-${viagemId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "viagem_localizacoes",
          filter: `viagem_id=eq.${viagemId}`,
        },
        (payload) => {
          const next = payload.new as Point;
          setPoints((current) => {
            if (current.some((p) => p.id === next.id)) return current;
            return [...current, next].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, viagemId]);

  useEffect(() => {
    if (!open || points.length === 0) return;
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !mapDivRef.current) return;
      if (!mapRef.current) {
        mapRef.current = new google.maps.Map(mapDivRef.current, {
          center: { lat: points[0].latitude, lng: points[0].longitude },
          zoom: 12,
          streetViewControl: false,
          mapTypeControl: false,
        });
      }
      const path = points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
      if (!polylineRef.current) {
        polylineRef.current = new google.maps.Polyline({
          path,
          strokeColor: getComputedStyle(document.documentElement)
            .getPropertyValue("--brand")
            .trim(),
          strokeOpacity: 0.9,
          strokeWeight: 4,
          map: mapRef.current,
        });
      } else {
        polylineRef.current.setPath(path);
      }
      if (!startMarkerRef.current) {
        startMarkerRef.current = new google.maps.Marker({
          position: path[0],
          map: mapRef.current,
          label: "A",
          title: "Origem do trajeto",
        });
      } else {
        startMarkerRef.current.setPosition(path[0]);
      }
      if (!currentMarkerRef.current) {
        currentMarkerRef.current = new google.maps.Marker({
          position: path[path.length - 1],
          map: mapRef.current,
          icon: truckIcon(),
          title: "Última posição",
        });
      } else {
        currentMarkerRef.current.setPosition(path[path.length - 1]);
      }
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      mapRef.current.fitBounds(bounds, 40);
    });
    return () => {
      cancelled = true;
    };
  }, [open, points]);

  const km = points.reduce((acc, p, i) => (i === 0 ? 0 : acc + haversineKm(points[i - 1], p)), 0);
  const inicio = points[0]?.created_at;
  const fim = points[points.length - 1]?.created_at;
  const tempoMin =
    inicio && fim
      ? Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000))
      : 0;
  const eventos = points.reduce<{ events: RouteEvent[]; distanceKm: number }>(
    (acc, point, index) => {
      const distanceKm = index === 0 ? 0 : acc.distanceKm + haversineKm(points[index - 1], point);
      const elapsedMin = inicio
        ? Math.max(
            0,
            Math.round((new Date(point.created_at).getTime() - new Date(inicio).getTime()) / 60000),
          )
        : 0;
      const lastEventKm = acc.events[acc.events.length - 1]?.distanceKm ?? 0;
      if (index === 0 || index === points.length - 1 || distanceKm - lastEventKm >= 10) {
        acc.events.push({ point, distanceKm, elapsedMin });
      }
      return { events: acc.events, distanceKm };
    },
    { events: [], distanceKm: 0 },
  ).events;

  const resetMap = () => {
    polylineRef.current?.setMap(null);
    startMarkerRef.current?.setMap(null);
    currentMarkerRef.current?.setMap(null);
    polylineRef.current = null;
    startMarkerRef.current = null;
    currentMarkerRef.current = null;
    mapRef.current = null;
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RouteIcon className="mr-2 size-4" /> Visualizar Rota
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetMap();
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Rota da viagem</DialogTitle>
            <DialogDescription>
              {points.length > 0
                ? `${km.toFixed(1)} km percorridos · ${tempoMin} min de trajeto · ${points.length} pontos registrados`
                : "Ainda não há posições registradas para esta viagem."}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="grid h-[400px] place-items-center">
              <Loader2 className="size-6 animate-spin text-brand" />
            </div>
          ) : points.length === 0 ? (
            <div className="grid h-[300px] place-items-center text-sm text-muted-foreground">
              Nenhum ponto de GPS registrado.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[1fr_260px]">
              <div
                ref={mapDivRef}
                className="h-[500px] w-full rounded-lg border border-border/60"
              />
              <div className="max-h-[500px] overflow-y-auto rounded-lg border border-border/60 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Eventos da rota
                </div>
                <div className="space-y-2">
                  {eventos.map((event, index) => (
                    <div
                      key={`${event.point.id}-${index}`}
                      className="rounded-md bg-muted p-2 text-xs"
                    >
                      <div className="font-medium">
                        {index === 0
                          ? "Início"
                          : index === eventos.length - 1
                            ? "Última posição"
                            : "Marco do trajeto"}
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {new Date(event.point.created_at).toLocaleString("pt-BR")}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-brand">
                        {event.distanceKm.toFixed(1)} km · {event.elapsedMin} min
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
