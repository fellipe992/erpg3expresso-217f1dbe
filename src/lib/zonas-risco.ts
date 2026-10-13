import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ZonaRisco = {
  id: string;
  nome: string;
  tipo: string;
  nivel: number;
  lat: number;
  lng: number;
  raio_m: number;
  uf: string | null;
  horario_critico: string | null;
  recomendacao: string | null;
  origem: string;
};

export const NIVEIS: Record<number, { label: string; cor: string }> = {
  1: { label: "Tranquilo", cor: "#16A34A" },
  2: { label: "Médio", cor: "#EAB308" },
  3: { label: "Alto", cor: "#F97316" },
  4: { label: "Muito alto", cor: "#DC2626" },
};

export const TIPOS_RISCO: Record<string, string> = {
  roubo: "Roubo de carga",
  assalto: "Assalto",
  acidente: "Acidentes",
  outro: "Outro",
};

export const TIPOS_CARGA: Record<string, { label: string; peso: number }> = {
  geral: { label: "Carga geral", peso: 1 },
  alimentos: { label: "Alimentos / bebidas", peso: 1.3 },
  refrigerada: { label: "Refrigerada", peso: 1.3 },
  medicamentos: { label: "Medicamentos", peso: 1.8 },
  eletronicos: { label: "Eletrônicos", peso: 2 },
  cigarros: { label: "Cigarros / alto valor", peso: 2.2 },
  combustivel: { label: "Combustível", peso: 1.5 },
};

export function useZonasRisco() {
  return useQuery({
    queryKey: ["zonas-risco"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("zonas_risco")
        .select("id,nome,tipo,nivel,lat,lng,raio_m,uf,horario_critico,recomendacao,origem")
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as ZonaRisco[];
    },
  });
}

export function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (v: number) => (v * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Zona mais grave que contém o ponto (ou está a até `folgaM` metros da borda). */
export function zonaNoPonto(zonas: ZonaRisco[], p: { lat: number; lng: number }, folgaM = 0) {
  let pior: ZonaRisco | null = null;
  for (const z of zonas) {
    if (distM(p, z) <= z.raio_m + folgaM && (!pior || z.nivel > pior.nivel)) pior = z;
  }
  return pior;
}

/** Decodifica polyline do Google (formato encoded). */
export function decodePolyline(str: string) {
  const pts: { lat: number; lng: number }[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, result = 0;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

const PESO_NIVEL = [0, 0, 1, 3, 6];

/** Nota de risco da rota: km dentro de cada nível × peso do nível × peso da carga. */
export function avaliarRota(polyline: string, zonas: ZonaRisco[], tipoCarga = "geral") {
  const pts = decodePolyline(polyline);
  const kmPorNivel = [0, 0, 0, 0, 0];
  const atravessadas = new Map<string, ZonaRisco>();
  for (let i = 1; i < pts.length; i++) {
    const seg = distM(pts[i - 1], pts[i]) / 1000;
    const z = zonaNoPonto(zonas, pts[i]);
    if (z) {
      kmPorNivel[z.nivel] += seg;
      atravessadas.set(z.id, z);
    }
  }
  const peso = TIPOS_CARGA[tipoCarga]?.peso ?? 1;
  const pontos = kmPorNivel.reduce((s, km, n) => s + km * PESO_NIVEL[n], 0) * peso;
  return {
    nota: Math.round(pontos),
    kmPorNivel,
    zonas: [...atravessadas.values()].sort((a, b) => b.nivel - a.nivel),
    temVermelha: kmPorNivel[4] > 0,
  };
}

export function rotuloRisco(nota: number) {
  if (nota === 0) return NIVEIS[1];
  if (nota < 20) return NIVEIS[2];
  if (nota < 80) return NIVEIS[3];
  return NIVEIS[4];
}

/** Desenha as zonas como círculos coloridos num mapa Google. */
export function desenharZonas(
  map: google.maps.Map,
  zonas: ZonaRisco[],
  info?: google.maps.InfoWindow,
): google.maps.Circle[] {
  return zonas.map((z) => {
    const cor = NIVEIS[z.nivel]?.cor ?? "#EAB308";
    const c = new google.maps.Circle({
      map,
      center: { lat: z.lat, lng: z.lng },
      radius: z.raio_m,
      strokeColor: cor,
      strokeOpacity: 0.8,
      strokeWeight: 1,
      fillColor: cor,
      fillOpacity: 0.22 + z.nivel * 0.04,
      clickable: !!info,
      zIndex: z.nivel,
    });
    if (info) {
      c.addListener("click", (e: google.maps.MapMouseEvent) => {
        info.setContent(
          `<div style="font:13px sans-serif;max-width:240px;color:#111"><b>${z.nome}</b><br/>` +
            `<span style="color:${cor};font-weight:600">Risco ${NIVEIS[z.nivel]?.label}</span> · ${TIPOS_RISCO[z.tipo] ?? z.tipo}<br/>` +
            (z.horario_critico ? `Horário crítico: ${z.horario_critico}<br/>` : "") +
            (z.recomendacao ? `<i>${z.recomendacao}</i>` : "") +
            `</div>`,
        );
        info.setPosition(e.latLng ?? { lat: z.lat, lng: z.lng });
        info.open({ map });
      });
    }
    return c;
  });
}
