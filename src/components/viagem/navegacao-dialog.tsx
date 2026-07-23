/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { Navigation, Loader2, MapPin, Search, RotateCw } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleMaps, truckIcon } from "@/lib/google-maps-loader";

type Props = {
  viagemId: string;
  destinoCidade?: string | null;
  destinoUf?: string | null;
};

type Suggestion = { placeId: string; text: string };

export function NavegacaoButton({ viagemId, destinoCidade, destinoUf }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="w-full bg-brand hover:bg-brand/90 md:w-auto"
        size="sm"
      >
        <Navigation className="mr-2 size-4" /> Navegação
      </Button>
      {open && (
        <NavegacaoDialog
          viagemId={viagemId}
          destinoCidade={destinoCidade}
          destinoUf={destinoUf}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function NavegacaoDialog({
  viagemId,
  destinoCidade,
  destinoUf,
  onClose,
}: Props & { onClose: () => void }) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const rendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const dirServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const truckMarkerRef = useRef<google.maps.Marker | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [loading, setLoading] = useState(true);
  const [gmaps, setGmaps] = useState<typeof google | null>(null);
  const [query, setQuery] = useState(
    destinoCidade ? `${destinoCidade}${destinoUf ? ` - ${destinoUf}` : ""}` : "",
  );
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<google.maps.LatLngLiteral | null>(null);
  const [destinationLabel, setDestinationLabel] = useState<string>("");
  const [routeInfo, setRouteInfo] = useState<{
    distanceText: string;
    durationText: string;
    durationInTrafficText?: string;
  } | null>(null);
  const [origin, setOrigin] = useState<google.maps.LatLngLiteral | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  // Carrega Maps
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (!cancelled) setGmaps(g);
      })
      .catch((e) => toast.error("Google Maps indisponível", { description: e.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Inicializa mapa
  useEffect(() => {
    if (!gmaps || !mapDivRef.current || mapRef.current) return;
    mapRef.current = new gmaps.maps.Map(mapDivRef.current, {
      center: { lat: -15.79, lng: -47.88 },
      zoom: 5,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: true,
    });
    rendererRef.current = new gmaps.maps.DirectionsRenderer({
      map: mapRef.current,
      suppressMarkers: false,
      polylineOptions: {
        strokeColor:
          getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() ||
          "#F15A24",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      },
    });
    dirServiceRef.current = new gmaps.maps.DirectionsService();
    sessionTokenRef.current = new gmaps.maps.places.AutocompleteSessionToken();
  }, [gmaps]);

  // Última localização conhecida (inicial)
  useEffect(() => {
    supabase
      .from("viagem_localizacoes")
      .select("latitude, longitude")
      .eq("viagem_id", viagemId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setOrigin({ lat: Number(data.latitude), lng: Number(data.longitude) });
      });
  }, [viagemId]);

  // Realtime: atualiza posição do caminhão
  useEffect(() => {
    const channel = supabase
      .channel(`nav-viagem-${viagemId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "viagem_localizacoes",
          filter: `viagem_id=eq.${viagemId}`,
        },
        (payload) => {
          const p = payload.new as { latitude: number; longitude: number };
          setOrigin({ lat: Number(p.latitude), lng: Number(p.longitude) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [viagemId]);

  // Se não temos localização armazenada, tenta pegar do GPS
  useEffect(() => {
    if (origin || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* ignora */
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [origin]);

  // Marcador do caminhão
  useEffect(() => {
    if (!gmaps || !mapRef.current || !origin) return;
    if (!truckMarkerRef.current) {
      truckMarkerRef.current = new gmaps.maps.Marker({
        position: origin,
        map: mapRef.current,
        icon: truckIcon(),
        title: "Sua posição",
        zIndex: 999,
      });
      mapRef.current.setCenter(origin);
      mapRef.current.setZoom(13);
    } else {
      truckMarkerRef.current.setPosition(origin);
    }
  }, [gmaps, origin]);

  // Busca de sugestões (debounced)
  useEffect(() => {
    if (!gmaps || !query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    if (destinationLabel && query === destinationLabel) return;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const { AutocompleteSuggestion } = (await gmaps.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        const req: google.maps.places.AutocompleteRequest = {
          input: query,
          sessionToken: sessionTokenRef.current ?? undefined,
          region: "br",
          language: "pt-BR",
        };
        if (origin) {
          req.locationBias = new gmaps.maps.Circle({
            center: origin,
            radius: 200_000,
          });
        }
        const { suggestions: results } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        setSuggestions(
          results
            .map((s) => {
              const p = s.placePrediction;
              if (!p) return null;
              return {
                placeId: p.placeId,
                text: p.text?.toString() ?? "",
              } as Suggestion;
            })
            .filter((x): x is Suggestion => !!x)
            .slice(0, 6),
        );
      } catch (e) {
        // ignora falhas transitórias
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [gmaps, query, origin, destinationLabel]);

  // Selecionar destino → geocodifica placeId
  const selectSuggestion = async (s: Suggestion) => {
    if (!gmaps) return;
    setSuggestions([]);
    setQuery(s.text);
    setDestinationLabel(s.text);
    try {
      const { Place } = (await gmaps.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const place = new Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "displayName", "formattedAddress"] });
      if (place.location) {
        setDestination({ lat: place.location.lat(), lng: place.location.lng() });
      }
      sessionTokenRef.current = new gmaps.maps.places.AutocompleteSessionToken();
    } catch (e) {
      toast.error("Não foi possível carregar o destino");
    }
  };

  // Calcula rota
  const computeRoute = async () => {
    if (!gmaps || !dirServiceRef.current || !rendererRef.current || !origin || !destination)
      return;
    setRecalculating(true);
    try {
      const res = await dirServiceRef.current.route({
        origin,
        destination,
        travelMode: gmaps.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: gmaps.maps.TrafficModel.BEST_GUESS,
        },
        provideRouteAlternatives: false,
        region: "BR",
      });
      rendererRef.current.setDirections(res);
      const leg = res.routes[0]?.legs[0];
      if (leg) {
        setRouteInfo({
          distanceText: leg.distance?.text ?? "—",
          durationText: leg.duration?.text ?? "—",
          durationInTrafficText: leg.duration_in_traffic?.text,
        });
      }
    } catch (e) {
      toast.error("Não foi possível calcular a rota", {
        description: (e as Error).message,
      });
    } finally {
      setRecalculating(false);
    }
  };

  // Recalcula automaticamente quando origem/destino mudam
  useEffect(() => {
    if (origin && destination) void computeRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.lat, destination?.lng]);

  // Recalcula a cada 3 minutos com a posição atual (trânsito ao vivo)
  useEffect(() => {
    if (!destination) return;
    const t = setInterval(() => {
      if (origin && destination) void computeRoute();
    }, 3 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.lat, destination?.lng, origin?.lat, origin?.lng]);

  const abrirNoGoogleMaps = () => {
    if (!destination) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="size-4 text-brand" /> Navegação da viagem
          </DialogTitle>
          <DialogDescription>
            Rota mais rápida com trânsito ao vivo. Sua posição atualiza automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 p-3 md:grid-cols-[320px_1fr]">
          {/* Painel lateral */}
          <div className="space-y-3">
            <div className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setDestinationLabel("");
                  }}
                  placeholder="Digite o destino..."
                  className="pl-8"
                  autoFocus
                />
              </div>
              {suggestions.length > 0 && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                  {suggestions.map((s) => (
                    <button
                      key={s.placeId}
                      type="button"
                      onClick={() => selectSuggestion(s)}
                      className="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
                    >
                      <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
                      <span>{s.text}</span>
                    </button>
                  ))}
                </div>
              )}
              {searching && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>

            {routeInfo && destination && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-brand-subtle/40 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Distância
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {routeInfo.distanceText}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Duração
                  </span>
                  <span className="font-mono text-sm font-semibold">
                    {routeInfo.durationText}
                  </span>
                </div>
                {routeInfo.durationInTrafficText && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Com trânsito
                    </span>
                    <span className="font-mono text-sm font-semibold text-brand">
                      {routeInfo.durationInTrafficText}
                    </span>
                  </div>
                )}
              </div>
            )}

            {destination && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void computeRoute()}
                  disabled={recalculating}
                >
                  <RotateCw
                    className={`mr-2 size-4 ${recalculating ? "animate-spin" : ""}`}
                  />
                  Recalcular rota
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={abrirNoGoogleMaps}
                >
                  Abrir no Google Maps
                </Button>
              </>
            )}

            <p className="text-[11px] text-muted-foreground">
              A rota é atualizada automaticamente a cada 3 minutos com o trânsito atual e a sua
              nova posição. Sua localização é registrada enquanto a viagem estiver em andamento.
            </p>
          </div>

          {/* Mapa */}
          <div className="relative">
            <div
              ref={mapDivRef}
              className="h-[70vh] w-full rounded-lg border border-border/60 md:h-[75vh]"
            />
            {loading && (
              <div className="absolute inset-0 grid place-items-center rounded-lg bg-background/70">
                <Loader2 className="size-6 animate-spin text-brand" />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
