/// <reference types="google.maps" />
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigation, Loader2, MapPin, Search, RotateCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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

type Parada = {
  id: string;
  ordem: number;
  cliente: string | null;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  entregue_em: string | null;
};

/** Ponto no formato aceito pelo Directions e pelas URLs do Google Maps. */
function ponto(p: Parada): string | google.maps.LatLngLiteral {
  return p.latitude != null && p.longitude != null
    ? { lat: Number(p.latitude), lng: Number(p.longitude) }
    : p.endereco;
}

function pontoTexto(p: Parada) {
  return p.latitude != null && p.longitude != null ? `${p.latitude},${p.longitude}` : p.endereco;
}

/**
 * Links do Google Maps com o roteiro completo. O app limita ~9 paradas
 * intermediárias por link, então rotas maiores viram trechos encadeados
 * (o fim de um trecho é o início do próximo).
 */
function linksGoogleMaps(paradas: Parada[], origem?: google.maps.LatLngLiteral | null) {
  const grupos: Parada[][] = [];
  for (let i = 0; i < paradas.length; i += 10) grupos.push(paradas.slice(i, i + 10));
  return grupos.map((grupo, i) => {
    const destino = grupo[grupo.length - 1];
    const meio = grupo.slice(0, -1);
    const params = new URLSearchParams({ api: "1", travelmode: "driving", dir_action: "navigate" });
    if (i === 0) {
      if (origem) params.set("origin", `${origem.lat},${origem.lng}`);
    } else {
      const anterior = grupos[i - 1][grupos[i - 1].length - 1];
      params.set("origin", pontoTexto(anterior));
    }
    params.set("destination", pontoTexto(destino));
    if (meio.length) params.set("waypoints", meio.map(pontoTexto).join("|"));
    return {
      indice: i + 1,
      total: grupos.length,
      inicio: grupo[0].ordem,
      fim: destino.ordem,
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
    };
  });
}

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
  const renderersRef = useRef<google.maps.DirectionsRenderer[]>([]);
  const dirServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const truckMarkerRef = useRef<google.maps.Marker | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [loading, setLoading] = useState(true);
  const [gmaps, setGmaps] = useState<typeof google | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [destination, setDestination] = useState<google.maps.LatLngLiteral | null>(null);
  const [destinationLabel, setDestinationLabel] = useState<string>("");
  const [routeInfo, setRouteInfo] = useState<{
    distanceText: string;
    durationText: string;
  } | null>(null);
  const [origin, setOrigin] = useState<google.maps.LatLngLiteral | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  /** Paradas programadas pela roteirização (roteiro completo da viagem). */
  const { data: paradas = [] } = useQuery({
    queryKey: ["viagem-paradas-nav", viagemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagem_paradas")
        .select("id, ordem, cliente, endereco, latitude, longitude, entregue_em")
        .eq("viagem_id", viagemId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Parada[];
    },
  });

  /** Só as paradas ainda não entregues seguem no roteiro de navegação. */
  const pendentes = useMemo(() => paradas.filter((p) => !p.entregue_em), [paradas]);
  const temRoteiro = pendentes.length > 0;

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

  // Destino manual pré-preenchido apenas quando não há roteiro programado
  useEffect(() => {
    if (temRoteiro || query || !destinoCidade) return;
    setQuery(`${destinoCidade}${destinoUf ? ` - ${destinoUf}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temRoteiro, destinoCidade, destinoUf]);

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

  const limparRenderers = useCallback(() => {
    renderersRef.current.forEach((r) => r.setMap(null));
    renderersRef.current = [];
  }, []);

  const novoRenderer = useCallback(() => {
    if (!gmaps) return null;
    const r = new gmaps.maps.DirectionsRenderer({
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
    renderersRef.current.push(r);
    return r;
  }, [gmaps]);

  /**
   * Traça o roteiro completo: da posição atual passando por todas as paradas
   * pendentes, na sequência definida pela roteirização. O Directions aceita no
   * máximo 25 waypoints por requisição, então rotas longas são calculadas em
   * trechos encadeados e desenhadas juntas no mapa.
   */
  const calcularRoteiro = useCallback(async () => {
    if (!gmaps || !dirServiceRef.current || !mapRef.current || !pendentes.length) return;
    setRecalculating(true);
    try {
      limparRenderers();
      const bounds = new gmaps.maps.LatLngBounds();
      let metros = 0;
      let segundos = 0;
      const LIMITE = 24; // origem + até 23 waypoints + destino
      let inicio: string | google.maps.LatLngLiteral | null = origin ?? null;
      let i = 0;
      while (i < pendentes.length) {
        const trecho = pendentes.slice(i, i + LIMITE);
        const partida = inicio ?? ponto(trecho[0]);
        const lista = inicio ? trecho : trecho.slice(1);
        if (!lista.length) break;
        const destinoTrecho = lista[lista.length - 1];
        const meio = lista.slice(0, -1);
        const res = await dirServiceRef.current.route({
          origin: partida,
          destination: ponto(destinoTrecho),
          waypoints: meio.map((p) => ({ location: ponto(p), stopover: true })),
          optimizeWaypoints: false,
          travelMode: gmaps.maps.TravelMode.DRIVING,
          region: "BR",
        });
        const renderer = novoRenderer();
        renderer?.setDirections(res);
        res.routes[0]?.legs.forEach((l) => {
          metros += l.distance?.value ?? 0;
          segundos += l.duration?.value ?? 0;
        });
        const b = res.routes[0]?.bounds;
        if (b) bounds.union(b);
        inicio = ponto(destinoTrecho);
        i += lista.length;
      }
      if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds);
      const horas = Math.floor(segundos / 3600);
      const min = Math.round((segundos % 3600) / 60);
      setRouteInfo({
        distanceText: `${(metros / 1000).toFixed(1)} km`,
        durationText: horas ? `${horas} h ${min} min` : `${min} min`,
      });
    } catch (e) {
      toast.error("Não foi possível traçar o roteiro", { description: (e as Error).message });
    } finally {
      setRecalculating(false);
    }
  }, [gmaps, limparRenderers, novoRenderer, origin, pendentes]);

  // Rota simples até um destino digitado (quando não há roteiro programado)
  const computeRoute = useCallback(async () => {
    if (!gmaps || !dirServiceRef.current || !origin || !destination) return;
    setRecalculating(true);
    try {
      limparRenderers();
      const res = await dirServiceRef.current.route({
        origin,
        destination,
        travelMode: gmaps.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: gmaps.maps.TrafficModel.BEST_GUESS,
        },
        region: "BR",
      });
      novoRenderer()?.setDirections(res);
      const leg = res.routes[0]?.legs[0];
      if (leg) {
        setRouteInfo({
          distanceText: leg.distance?.text ?? "—",
          durationText: leg.duration_in_traffic?.text ?? leg.duration?.text ?? "—",
        });
      }
    } catch (e) {
      toast.error("Não foi possível calcular a rota", { description: (e as Error).message });
    } finally {
      setRecalculating(false);
    }
  }, [gmaps, limparRenderers, novoRenderer, origin, destination]);

  // Traça o roteiro programado assim que o mapa e as paradas estão prontos
  useEffect(() => {
    if (gmaps && temRoteiro && !destination) void calcularRoteiro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmaps, temRoteiro, pendentes.length]);

  useEffect(() => {
    if (destination) void computeRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.lat, destination?.lng]);

  // Recalcula a cada 3 minutos com a posição atual
  useEffect(() => {
    const t = setInterval(() => {
      if (destination) void computeRoute();
      else if (temRoteiro) void calcularRoteiro();
    }, 3 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination?.lat, destination?.lng, origin?.lat, origin?.lng, temRoteiro]);

  useEffect(() => () => limparRenderers(), [limparRenderers]);

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
          req.locationBias = new gmaps.maps.Circle({ center: origin, radius: 200_000 });
        }
        const { suggestions: results } =
          await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        setSuggestions(
          results
            .map((s) => {
              const p = s.placePrediction;
              if (!p) return null;
              return { placeId: p.placeId, text: p.text?.toString() ?? "" } as Suggestion;
            })
            .filter((x): x is Suggestion => !!x)
            .slice(0, 6),
        );
      } catch {
        // ignora falhas transitórias
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [gmaps, query, origin, destinationLabel]);

  const selectSuggestion = async (s: Suggestion) => {
    if (!gmaps) return;
    setSuggestions([]);
    setQuery(s.text);
    setDestinationLabel(s.text);
    try {
      const { Place } = (await gmaps.maps.importLibrary("places")) as google.maps.PlacesLibrary;
      const place = new Place({ id: s.placeId });
      await place.fetchFields({ fields: ["location", "displayName", "formattedAddress"] });
      if (place.location) {
        setDestination({ lat: place.location.lat(), lng: place.location.lng() });
      }
      sessionTokenRef.current = new gmaps.maps.places.AutocompleteSessionToken();
    } catch {
      toast.error("Não foi possível carregar o destino");
    }
  };

  const voltarAoRoteiro = () => {
    setDestination(null);
    setDestinationLabel("");
    setQuery("");
    void calcularRoteiro();
  };

  const links = useMemo(() => linksGoogleMaps(pendentes, origin), [pendentes, origin]);

  const abrirDestinoNoGoogleMaps = () => {
    if (!destination) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving&dir_action=navigate`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[95vh] max-w-5xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Navigation className="size-4 text-brand" /> Navegação da viagem
          </DialogTitle>
          <DialogDescription>
            {temRoteiro
              ? "Roteiro completo das entregas traçado a partir da sua posição — siga no mapa ou envie para o Google Maps."
              : "Rota mais rápida com trânsito ao vivo. Sua posição atualiza automaticamente."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[85vh] gap-3 overflow-y-auto p-3 md:grid-cols-[320px_1fr]">
          {/* Painel lateral */}
          <div className="space-y-3">
            {temRoteiro && !destination && (
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-xs font-semibold">
                  Roteiro programado · {pendentes.length} paradas
                </p>
                <ol className="max-h-52 space-y-1 overflow-y-auto">
                  {pendentes.map((p) => (
                    <li key={p.id} className="flex items-start gap-2 text-[11px]">
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-brand text-[9px] font-bold text-white">
                        {p.ordem}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {p.cliente || p.endereco.split(",")[0]}
                        </span>
                        <span className="block truncate text-muted-foreground">{p.endereco}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2">
                  {links.map((l) => (
                    <Button
                      key={l.indice}
                      asChild
                      size="sm"
                      className="bg-brand hover:bg-brand/90"
                    >
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 size-3.5" />
                        {l.total > 1
                          ? `Google Maps · paradas ${l.inicio}–${l.fim}`
                          : "Iniciar no Google Maps"}
                      </a>
                    </Button>
                  ))}
                </div>
                {links.length > 1 && (
                  <p className="text-[10px] text-muted-foreground">
                    O app do Google Maps limita as paradas por link — abra os trechos em sequência.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => void calcularRoteiro()}
                  disabled={recalculating}
                >
                  <RotateCw className={`mr-2 size-4 ${recalculating ? "animate-spin" : ""}`} />
                  Recalcular roteiro
                </Button>
              </div>
            )}

            <div className="relative">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setDestinationLabel("");
                  }}
                  placeholder={temRoteiro ? "Ou navegue até outro destino…" : "Digite o destino..."}
                  className="pl-8"
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

            {routeInfo && (
              <div className="space-y-2 rounded-lg border border-border/60 bg-brand-subtle/40 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Distância
                  </span>
                  <span className="font-mono text-sm font-semibold">{routeInfo.distanceText}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Duração
                  </span>
                  <span className="font-mono text-sm font-semibold">{routeInfo.durationText}</span>
                </div>
                {temRoteiro && !destination && (
                  <Badge variant="outline" className="text-[10px]">
                    {pendentes.length} paradas no trajeto
                  </Badge>
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
                  <RotateCw className={`mr-2 size-4 ${recalculating ? "animate-spin" : ""}`} />
                  Recalcular rota
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={abrirDestinoNoGoogleMaps}
                >
                  Abrir no Google Maps
                </Button>
                {temRoteiro && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={voltarAoRoteiro}>
                    Voltar ao roteiro de entregas
                  </Button>
                )}
              </>
            )}

            <p className="text-[11px] text-muted-foreground">
              A rota é atualizada automaticamente a cada 3 minutos com a sua nova posição. Sua
              localização é registrada enquanto a viagem estiver em andamento.
            </p>
          </div>

          {/* Mapa */}
          <div className="relative">
            <div
              ref={mapDivRef}
              className="h-[70vh] w-full rounded-lg border border-border/60 md:h-[75vh]"
            />
            {(loading || recalculating) && (
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
