/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { corDaEntrega, corDaRota } from "@/lib/roteirizacao/regioes";
import { temCoordenada } from "@/lib/roteirizacao/geo";
import type { Deposito, Entrega, Rota } from "@/lib/roteirizacao/tipos";

type Props = {
  entregas: Entrega[];
  depositos: Deposito[];
  rotas: Rota[];
  ocultas: Set<string>;
  selecionada?: string | null;
  onSelecionarEntrega?: (id: string) => void;
  /** disparado ao arrastar um marcador para outra rota */
  onSoltarEmRota?: (entregaId: string, rotaId: string) => void;
};

function pino(cor: string, texto: string, destaque: boolean) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
    <path d="M17 43C17 43 32 26.5 32 16A15 15 0 1 0 2 16C2 26.5 17 43 17 43Z" fill="${cor}" stroke="${destaque ? "#141414" : "#ffffff"}" stroke-width="${destaque ? 3 : 2}"/>
    <text x="17" y="21" font-family="Inter,Arial,sans-serif" font-size="${texto.length > 2 ? 11 : 13}" font-weight="700" fill="#ffffff" text-anchor="middle">${texto}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function pinoBase() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <rect x="3" y="3" width="24" height="24" rx="6" fill="#141414" stroke="#ffffff" stroke-width="2"/>
    <path d="M9 19V13l6-4 6 4v6z" fill="#F15A24"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function MapaRoteirizador({
  entregas,
  depositos,
  rotas,
  ocultas,
  selecionada,
  onSelecionarEntrega,
  onSoltarEmRota,
}: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const linhasRef = useRef<google.maps.Polyline[]>([]);
  const infoRef = useRef<google.maps.InfoWindow | null>(null);
  const jaEnquadrou = useRef(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelado || !divRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(divRef.current, {
            center: { lat: -23.55, lng: -46.63 },
            zoom: 10,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
            clickableIcons: false,
          });
          infoRef.current = new google.maps.InfoWindow();
        }
        setPronto(true);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao carregar o mapa"));
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!pronto || !map || typeof google === "undefined") return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    linhasRef.current.forEach((l) => l.setMap(null));
    linhasRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let algumPonto = false;

    depositos.forEach((d) => {
      const marker = new google.maps.Marker({
        position: { lat: d.lat, lng: d.lng },
        map,
        icon: { url: pinoBase(), scaledSize: new google.maps.Size(30, 30), anchor: new google.maps.Point(15, 15) },
        title: `${d.nome} — ${d.endereco}`,
        zIndex: 999,
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: d.lat, lng: d.lng });
      algumPonto = true;
    });

    const emRota = new Set<string>();
    const rotaDaEntrega = new Map<string, { rotaId: string; cor: string; ordem: number; rotulo: string }>();

    rotas.forEach((r, i) => {
      const cor = corDaRota(i);
      r.paradas.forEach((p) => {
        emRota.add(p.entrega.id);
        rotaDaEntrega.set(p.entrega.id, {
          rotaId: r.id,
          cor,
          ordem: p.ordem,
          rotulo: r.rotulo ?? r.veiculo.nome,
        });
      });
      if (ocultas.has(r.id)) return;
      const cd = r.deposito ?? depositos[0];
      const caminho = [
        ...(cd ? [{ lat: cd.lat, lng: cd.lng }] : []),
        ...r.paradas
          .map((p) => p.entrega)
          .filter(temCoordenada)
          .map((e) => ({ lat: e.lat, lng: e.lng })),
        ...(cd ? [{ lat: cd.lat, lng: cd.lng }] : []),
      ];
      if (caminho.length < 2) return;
      linhasRef.current.push(
        new google.maps.Polyline({
          path: caminho,
          map,
          strokeColor: cor,
          strokeOpacity: 0.85,
          strokeWeight: 4,
          icons: [
            {
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 2.4, strokeColor: cor },
              offset: "50%",
              repeat: "140px",
            },
          ],
        }),
      );
    });

    entregas.filter(temCoordenada).forEach((e) => {
      const info = rotaDaEntrega.get(e.id);
      if (info && ocultas.has(info.rotaId)) return;
      const cor = info ? info.cor : corDaEntrega(e);
      const texto = info ? String(info.ordem) : "•";
      const marker = new google.maps.Marker({
        position: { lat: e.lat, lng: e.lng },
        map,
        draggable: !!info && !!onSoltarEmRota,
        icon: {
          url: pino(cor, texto, selecionada === e.id),
          scaledSize: new google.maps.Size(34, 44),
          anchor: new google.maps.Point(17, 43),
        },
        title: e.cliente || e.endereco,
      });
      marker.addListener("click", () => {
        onSelecionarEntrega?.(e.id);
        infoRef.current?.setContent(
          `<div style="font-family:Inter,Arial,sans-serif;max-width:250px;color:#141414">
            <div style="font-weight:700;margin-bottom:2px">${(e.cliente || e.endereco).replace(/</g, "")}</div>
            ${e.nf ? `<div style="font-size:12px">NF ${e.nf}</div>` : ""}
            <div style="font-size:12px;color:#555">${e.endereco.replace(/</g, "")}</div>
            <div style="font-size:12px;margin-top:4px">${e.pesoKg.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg • ${e.tempoDescargaMin} min</div>
            ${e.horarioEntrega ? `<div style="font-size:12px">Janela até ${e.horarioEntrega}</div>` : ""}
            ${e.regiao ? `<div style="font-size:12px;color:#555">${e.regiao}</div>` : ""}
            ${info ? `<div style="font-size:12px;margin-top:4px;font-weight:600">${info.rotulo} • parada ${info.ordem}</div>` : ""}
            ${e.observacoes ? `<div style="font-size:12px;margin-top:4px;color:#555">${e.observacoes.replace(/</g, "")}</div>` : ""}
          </div>`,
        );
        infoRef.current?.open({ map, anchor: marker });
      });
      if (info && onSoltarEmRota) {
        marker.addListener("dragend", (ev: google.maps.MapMouseEvent) => {
          const pos = ev.latLng;
          if (!pos) return;
          let melhorRota = info.rotaId;
          let melhorDist = Infinity;
          rotas.forEach((r) => {
            if (ocultas.has(r.id)) return;
            const pontos = [
              ...(r.deposito ? [r.deposito] : []),
              ...r.paradas.map((p) => p.entrega).filter(temCoordenada),
            ];
            pontos.forEach((p) => {
              const d = google.maps.geometry.spherical.computeDistanceBetween(
                pos,
                new google.maps.LatLng(p.lat, p.lng),
              );
              if (d < melhorDist) {
                melhorDist = d;
                melhorRota = r.id;
              }
            });
          });
          marker.setPosition({ lat: e.lat, lng: e.lng });
          onSoltarEmRota(e.id, melhorRota);
        });
      }
      markersRef.current.push(marker);
      bounds.extend({ lat: e.lat, lng: e.lng });
      algumPonto = true;
    });

    if (algumPonto && !jaEnquadrou.current) {
      map.fitBounds(bounds, 60);
      jaEnquadrou.current = true;
    }
  }, [entregas, depositos, rotas, ocultas, selecionada, pronto, onSelecionarEntrega, onSoltarEmRota]);

  const enquadrar = () => {
    const map = mapRef.current;
    if (!map || typeof google === "undefined") return;
    const bounds = new google.maps.LatLngBounds();
    let algum = false;
    [...depositos, ...entregas.filter(temCoordenada)].forEach((p) => {
      bounds.extend({ lat: p.lat, lng: p.lng });
      algum = true;
    });
    if (algum) map.fitBounds(bounds, 60);
  };

  return (
    <div className="relative size-full min-h-[420px] overflow-hidden rounded-xl border border-border/60">
      <div ref={divRef} className="size-full" />
      {(erro || (!pronto && !erro)) && (
        <div className="absolute inset-0 grid place-items-center bg-muted/60 p-6 text-center text-sm text-muted-foreground">
          {erro ? (
            <div className="space-y-2">
              <MapPin className="mx-auto size-6 text-brand" />
              <p>{erro}</p>
            </div>
          ) : (
            <Loader2 className="size-6 animate-spin text-brand" />
          )}
        </div>
      )}
      {pronto && (
        <button
          type="button"
          onClick={enquadrar}
          className="absolute bottom-6 left-3 rounded-md border border-border bg-background/95 px-3 py-1.5 text-xs font-medium shadow hover:bg-accent"
        >
          Enquadrar tudo
        </button>
      )}
    </div>
  );
}
