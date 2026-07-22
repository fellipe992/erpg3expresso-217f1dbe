import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, MapPin, Truck, Clock, Battery, Wifi, WifiOff, Locate, ExternalLink, Radar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { loadGoogleMaps, truckIcon } from "@/lib/google-maps-loader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/monitoramento")({
  head: () => ({ meta: [{ title: "Central de Monitoramento — G3 Expresso" }] }),
  beforeLoad: ({ context }) => {
    // gate ficará no componente por role (context não expõe role aqui)
    return context;
  },
  component: MonitoramentoPage,
});

type Loc = {
  id: string;
  viagem_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  velocidade: number | null;
  bateria: number | null;
  online: boolean | null;
  created_at: string;
};

type ViagemAtiva = {
  id: string;
  codigo: string | null;
  origem: string | null;
  destino: string | null;
  data_saida: string | null;
  km_inicial: number | null;
  cliente: { razao_social: string | null } | null;
  motorista: { id: string; nome: string; telefone: string | null; foto_url: string | null } | null;
  veiculo: { id: string; placa: string; modelo: string | null; marca: string | null; foto_url: string | null } | null;
};

function tempoDesde(iso: string | null) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m ? ` ${m}min` : ""}`;
}

function MonitoramentoPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const allowed = role === "administrador" || role === "gestor";

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const infoRef = useRef<google.maps.InfoWindow | null>(null);

  const { data: viagens = [] } = useQuery<ViagemAtiva[]>({
    queryKey: ["monitoramento-viagens"],
    enabled: allowed,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select(
          "id, codigo, origem, destino, data_saida, km_inicial, cliente:clientes(razao_social), motorista:motoristas(id, nome, telefone, foto_url), veiculo:veiculos(id, placa, modelo, marca, foto_url)",
        )
        .eq("status", "em_andamento");
      if (error) throw error;
      return (data ?? []) as unknown as ViagemAtiva[];
    },
  });

  // Última posição por viagem.
  const { data: locsByViagem = {} } = useQuery<Record<string, Loc>>({
    queryKey: ["monitoramento-locs", viagens.map((v) => v.id).sort().join(",")],
    enabled: allowed && viagens.length > 0,
    refetchInterval: 20_000,
    queryFn: async () => {
      const ids = viagens.map((v) => v.id);
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from("viagem_localizacoes")
        .select("id, viagem_id, latitude, longitude, heading, velocidade, bateria, online, created_at")
        .in("viagem_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map: Record<string, Loc> = {};
      for (const l of (data ?? []) as Loc[]) {
        if (!map[l.viagem_id]) map[l.viagem_id] = l;
      }
      return map;
    },
  });

  // Realtime — invalida ao receber novas posições.
  useEffect(() => {
    if (!allowed) return;
    const channel = supabase
      .channel("mon-locs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "viagem_localizacoes" },
        () => {
          qc.invalidateQueries({ queryKey: ["monitoramento-locs"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [allowed, qc]);

  // Inicializa mapa.
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !mapDivRef.current) return;
        mapRef.current = new google.maps.Map(mapDivRef.current, {
          center: { lat: -15.78, lng: -47.93 }, // Brasil
          zoom: 5,
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          styles: [
            { featureType: "poi", stylers: [{ visibility: "off" }] },
          ],
        });
        infoRef.current = new google.maps.InfoWindow();
      })
      .catch((err) => {
        console.error("[monitoramento] maps error", err);
      });
    return () => { cancelled = true; };
  }, [allowed]);

  // Atualiza marcadores.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;

    const activeIds = new Set(viagens.map((v) => v.id));
    // Remove marcadores obsoletos.
    for (const id of Object.keys(markersRef.current)) {
      if (!activeIds.has(id)) {
        markersRef.current[id].setMap(null);
        delete markersRef.current[id];
      }
    }

    const bounds = new window.google.maps.LatLngBounds();
    let has = false;
    for (const v of viagens) {
      const l = locsByViagem[v.id];
      if (!l) continue;
      has = true;
      const pos = { lat: l.latitude, lng: l.longitude };
      bounds.extend(pos);
      let marker = markersRef.current[v.id];
      if (!marker) {
        marker = new window.google.maps.Marker({
          map,
          position: pos,
          icon: truckIcon(),
          title: v.veiculo?.placa ?? "",
        });
        marker.addListener("click", () => {
          setSelectedId(v.id);
          openInfoWindow(v, l);
        });
        markersRef.current[v.id] = marker;
      } else {
        marker.setPosition(pos);
      }
    }

    if (has && !mapHasBeenFitRef.current) {
      map.fitBounds(bounds, 60);
      if (viagens.length === 1) map.setZoom(13);
      mapHasBeenFitRef.current = true;
    }
  }, [viagens, locsByViagem]);

  const mapHasBeenFitRef = useRef(false);

  function openInfoWindow(v: ViagemAtiva, l: Loc) {
    const map = mapRef.current;
    const info = infoRef.current;
    const marker = markersRef.current[v.id];
    if (!map || !info || !marker) return;
    const html = `
      <div style="font-family: system-ui, sans-serif; min-width: 220px; padding: 4px;">
        <div style="font-weight:700; font-size:14px; color:#141414;">${v.veiculo?.placa ?? ""} · ${v.veiculo?.modelo ?? ""}</div>
        <div style="font-size:12px; color:#7C7C7C; margin-top:2px;">${v.motorista?.nome ?? "—"}</div>
        <div style="margin-top:6px; font-size:12px;">
          <div><b>Cliente:</b> ${v.cliente?.razao_social ?? "—"}</div>
          <div><b>OS:</b> ${v.codigo ?? "—"}</div>
          <div><b>Origem:</b> ${v.origem ?? "—"}</div>
          <div><b>Destino:</b> ${v.destino ?? "—"}</div>
          <div><b>Início:</b> ${v.data_saida ? new Date(v.data_saida).toLocaleString("pt-BR") : "—"}</div>
          <div><b>Última posição:</b> ${new Date(l.created_at).toLocaleString("pt-BR")}</div>
        </div>
        <a href="/app/viagens/${v.id}" style="display:inline-block; margin-top:8px; padding:6px 10px; background:#F15A24; color:white; border-radius:6px; font-size:12px; text-decoration:none;">Abrir detalhes</a>
      </div>`;
    info.setContent(html);
    info.open({ map, anchor: marker });
  }

  function centralizar(v: ViagemAtiva) {
    const l = locsByViagem[v.id];
    const map = mapRef.current;
    if (!l || !map) return;
    map.panTo({ lat: l.latitude, lng: l.longitude });
    map.setZoom(15);
    setSelectedId(v.id);
    openInfoWindow(v, l);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return viagens;
    return viagens.filter((v) => {
      const hay = [
        v.veiculo?.placa,
        v.veiculo?.modelo,
        v.motorista?.nome,
        v.cliente?.razao_social,
        v.codigo,
        v.origem,
        v.destino,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [viagens, search]);

  if (!allowed) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Acesso restrito a Administrador e Gestor.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col md:flex-row">
      {/* Painel de operações */}
      <aside className="flex w-full flex-col border-b border-border/60 bg-background md:w-[380px] md:border-b-0 md:border-r">
        <div className="border-b border-border/60 p-4">
          <div className="flex items-center gap-2">
            <Radar className="size-5 text-brand" />
            <h1 className="text-lg font-semibold">Central de Monitoramento</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {viagens.length} {viagens.length === 1 ? "veículo em operação" : "veículos em operação"}
          </p>
          <div className="relative mt-3">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar placa, motorista, cliente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
              Nenhuma viagem em andamento no momento.
            </div>
          )}
          {filtered.map((v) => {
            const l = locsByViagem[v.id];
            const online = l?.online !== false;
            return (
              <Card
                key={v.id}
                className={cn(
                  "cursor-pointer p-3 transition hover:border-brand/50",
                  selectedId === v.id && "border-brand ring-1 ring-brand/40",
                )}
                onClick={() => centralizar(v)}
              >
                <div className="flex items-start gap-3">
                  {v.motorista?.foto_url ? (
                    <img
                      src={v.motorista.foto_url}
                      alt=""
                      className="size-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid size-10 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {v.motorista?.nome?.slice(0, 2).toUpperCase() ?? "—"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-foreground/90 px-1.5 py-0.5 text-[10px] font-bold text-background">
                        {v.veiculo?.placa ?? "—"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {v.veiculo?.modelo ?? ""}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm font-medium">{v.motorista?.nome ?? "—"}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {v.cliente?.razao_social ?? "—"}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="size-3" />
                      <span className="truncate">{v.origem ?? "—"} → {v.destino ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <Badge variant="outline" className="gap-1 border-green-500/40 text-green-700 dark:text-green-400">
                        <span className="size-1.5 rounded-full bg-green-500" />
                        Em andamento
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Clock className="size-3" /> {tempoDesde(v.data_saida)}
                      </span>
                      {online ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Wifi className="size-3" /> Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-500">
                          <WifiOff className="size-3" /> Offline
                        </span>
                      )}
                      {l?.bateria != null && (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Battery className="size-3" /> {l.bateria}%
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {l ? `Atualizado ${tempoDesde(l.created_at)} atrás` : "Sem posição ainda"}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 text-xs"
                    onClick={(e) => { e.stopPropagation(); centralizar(v); }}
                    disabled={!l}
                  >
                    <Locate className="mr-1 size-3" /> Centralizar
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="h-8 text-xs">
                    <Link to="/app/viagens/$id" params={{ id: v.id }} onClick={(e) => e.stopPropagation()}>
                      <ExternalLink className="mr-1 size-3" /> Detalhes
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </aside>

      {/* Mapa */}
      <div className="relative flex-1">
        <div ref={mapDivRef} className="absolute inset-0" />
        {viagens.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Card className="pointer-events-auto p-4 text-center text-sm text-muted-foreground shadow-lg">
              <Truck className="mx-auto mb-2 size-6 text-brand" />
              Nenhum veículo em operação agora.
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
