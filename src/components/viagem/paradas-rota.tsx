import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin, Navigation2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Parada = {
  id: string;
  ordem: number;
  cliente: string | null;
  endereco: string;
  nf: string | null;
  peso_kg: number | null;
  latitude: number | null;
  longitude: number | null;
  chegada_prevista: string | null;
};

/** Ponto no formato aceito pelas URLs do Google Maps / Waze. */
function ponto(p: Parada) {
  return p.latitude != null && p.longitude != null ? `${p.latitude},${p.longitude}` : p.endereco;
}

/**
 * O Google Maps aceita no máximo ~9 paradas intermediárias por link.
 * Rotas maiores são divididas em trechos encadeados (o fim de um trecho é o
 * início do próximo), mantendo a sequência completa do roteiro.
 */
function trechos(paradas: Parada[], porTrecho = 10) {
  const grupos: Parada[][] = [];
  for (let i = 0; i < paradas.length; i += porTrecho) grupos.push(paradas.slice(i, i + porTrecho));
  return grupos.map((grupo, i) => {
    const anterior = i > 0 ? grupos[i - 1][grupos[i - 1].length - 1] : null;
    const destino = grupo[grupo.length - 1];
    const meio = grupo.slice(0, -1);
    const params = new URLSearchParams({ api: "1", travelmode: "driving", dir_action: "navigate" });
    if (anterior) params.set("origin", ponto(anterior));
    params.set("destination", ponto(destino));
    if (meio.length) params.set("waypoints", meio.map(ponto).join("|"));
    return {
      indice: i + 1,
      total: grupos.length,
      inicio: grupo[0].ordem,
      fim: destino.ordem,
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
    };
  });
}

export function ParadasRotaCard({ viagemId }: { viagemId: string }) {
  const { data: paradas = [] } = useQuery({
    queryKey: ["viagem-paradas", viagemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagem_paradas")
        .select("id, ordem, cliente, endereco, nf, peso_kg, latitude, longitude, chegada_prevista")
        .eq("viagem_id", viagemId)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Parada[];
    },
  });

  const links = useMemo(() => trechos(paradas), [paradas]);
  const primeira = paradas[0];

  if (!paradas.length) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Roteiro programado</h2>
          <p className="text-xs text-muted-foreground">
            {paradas.length} paradas na sequência definida pela operação
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <Button key={l.indice} asChild size="sm" className="bg-brand hover:bg-brand/90">
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                <Navigation2 className="mr-2 size-4" />
                {l.total > 1 ? `Google Maps · paradas ${l.inicio}–${l.fim}` : "Abrir no Google Maps"}
              </a>
            </Button>
          ))}
          {primeira && (
            <Button asChild size="sm" variant="outline">
              <a
                href={`https://waze.com/ul?${new URLSearchParams({
                  q: primeira.endereco,
                  ...(primeira.latitude != null && primeira.longitude != null
                    ? { ll: `${primeira.latitude},${primeira.longitude}` }
                    : {}),
                  navigate: "yes",
                }).toString()}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-2 size-4" /> Waze (1ª parada)
              </a>
            </Button>
          )}
        </div>
      </div>

      <ol className="space-y-1">
        {paradas.map((p) => (
          <li key={p.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-xs">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">
              {p.ordem}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {p.cliente || p.endereco.split(",")[0]}
                {p.nf ? ` · NF ${p.nf}` : ""}
              </span>
              <span className="flex items-center gap-1 truncate text-muted-foreground">
                <MapPin className="size-3 shrink-0" /> {p.endereco}
              </span>
            </span>
            {p.chegada_prevista && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {p.chegada_prevista}
              </Badge>
            )}
          </li>
        ))}
      </ol>

      {links.length > 1 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          O Google Maps limita as paradas por link — abra os trechos em sequência para seguir todo o
          roteiro.
        </p>
      )}
    </Card>
  );
}
