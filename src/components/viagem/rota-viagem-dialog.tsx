/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Route as RouteIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleMaps, truckIcon } from "@/lib/google-maps-loader";

type Props = {
  viagemId: string;
};

type Point = { latitude: number; longitude: number; created_at: string };

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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("viagem_localizacoes")
      .select("latitude, longitude, created_at")
      .eq("viagem_id", viagemId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setPoints((data ?? []) as Point[]);
        setLoading(false);
      });
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
      new google.maps.Polyline({
        path,
        strokeColor: "#F15A24",
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map: mapRef.current,
      });
      new google.maps.Marker({
        position: path[0],
        map: mapRef.current,
        label: "A",
        title: "Origem do trajeto",
      });
      new google.maps.Marker({
        position: path[path.length - 1],
        map: mapRef.current,
        icon: truckIcon(),
        title: "Última posição",
      });
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      mapRef.current.fitBounds(bounds, 40);
    });
    return () => { cancelled = true; };
  }, [open, points]);

  const km = points.reduce((acc, p, i) => (i === 0 ? 0 : acc + haversineKm(points[i - 1], p)), 0);
  const inicio = points[0]?.created_at;
  const fim = points[points.length - 1]?.created_at;
  const tempoMin = inicio && fim ? Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000)) : 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RouteIcon className="mr-2 size-4" /> Visualizar Rota
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) mapRef.current = null; }}>
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
            <div ref={mapDivRef} className="h-[500px] w-full rounded-lg border border-border/60" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
