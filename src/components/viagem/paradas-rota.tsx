import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation2,
  RotateCcw,
  Warehouse,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aplicarOrdem, otimizarParadas } from "@/lib/otimizar-paradas";
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
      inicio: i * porTrecho + 1,
      fim: i * porTrecho + grupo.length,
      url: `https://www.google.com/maps/dir/?${params.toString()}`,
    };
  });
}

/** Reordena as paradas conforme uma lista de ids salva pelo motorista. */
function aplicarOrdemSalva(paradas: Parada[], ids: string[]) {
  const restantes = new Map(paradas.map((p) => [p.id, p]));
  const saida: Parada[] = [];
  for (const id of ids) {
    const p = restantes.get(id);
    if (p) {
      saida.push(p);
      restantes.delete(id);
    }
  }
  return [...saida, ...restantes.values()];
}

export function ParadasRotaCard({ viagemId }: { viagemId: string }) {
  const chaveOrdem = `g3:roteiro-ordem:${viagemId}`;
  const chaveCd = `g3:roteiro-cd:${viagemId}`;

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

  /**
   * Sequência local usada apenas para gerar os links de navegação. A ordem
   * otimizada pela operação continua salva no sistema — o motorista pode
   * reordenar aqui para atender um ponto antes, e o ajuste dele fica guardado
   * no próprio aparelho (não é perdido ao recarregar a tela).
   */
  const [sequencia, setSequencia] = useState<Parada[]>([]);
  const [alterada, setAlterada] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);
  /** Ponto final opcional: CD / base onde o motorista termina o roteiro. */
  const [cd, setCd] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCd(window.localStorage.getItem(chaveCd) ?? "");
  }, [chaveCd]);

  useEffect(() => {
    if (!paradas.length) {
      setSequencia([]);
      return;
    }
    const salvo =
      typeof window !== "undefined" ? window.localStorage.getItem(chaveOrdem) : null;
    if (salvo) {
      try {
        const ids = JSON.parse(salvo) as string[];
        const ordenadas = aplicarOrdemSalva(paradas, ids);
        setSequencia(ordenadas);
        setAlterada(ordenadas.some((p, i) => p.id !== paradas[i]?.id));
        return;
      } catch {
        /* ordem salva inválida — usa a otimizada */
      }
    }
    setSequencia(paradas);
    setAlterada(false);
  }, [paradas, chaveOrdem]);

  const salvarOrdem = (lista: Parada[]) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(chaveOrdem, JSON.stringify(lista.map((p) => p.id)));
  };

  const mover = (de: number, para: number) => {
    if (para < 0 || para >= sequencia.length || de === para) return;
    const lista = [...sequencia];
    const [item] = lista.splice(de, 1);
    lista.splice(para, 0, item);
    setSequencia(lista);
    setAlterada(true);
    salvarOrdem(lista);
  };

  const restaurar = () => {
    setSequencia(paradas);
    setAlterada(false);
    if (typeof window !== "undefined") window.localStorage.removeItem(chaveOrdem);
  };

  /**
   * Otimiza a sequência mantendo a 1ª parada como ponto de partida e o CD
   * (quando informado) como destino final — assim a rota termina na coleta.
   */
  const otimizar = async () => {
    const fim = cd.trim();
    const lista = sequencia;
    const meio = fim ? lista.slice(1) : lista.slice(1, -1);
    if (meio.length < 2) {
      toast.info("Informe o último ponto (CD) ou cadastre mais entregas para otimizar.");
      return;
    }
    setOtimizando(true);
    try {
      const { km, minutos, ordem } = await otimizarParadas({
        origem: ponto(lista[0]!),
        destino: fim || ponto(lista[lista.length - 1]!),
        paradas: meio.map(ponto),
      });
      const meioOrdenado = aplicarOrdem(meio, ordem);
      const nova = fim
        ? [lista[0]!, ...meioOrdenado]
        : [lista[0]!, ...meioOrdenado, lista[lista.length - 1]!];
      setSequencia(nova);
      setAlterada(true);
      salvarOrdem(nova);
      toast.success("Rota otimizada", {
        description: `${km.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} km · ${Math.round(minutos)} min${fim ? " · termina no CD" : ""}`,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOtimizando(false);
    }
  };



  const atualizarCd = (valor: string) => {
    setCd(valor);
    if (typeof window === "undefined") return;
    if (valor.trim()) window.localStorage.setItem(chaveCd, valor);
    else window.localStorage.removeItem(chaveCd);
  };

  /** Sequência efetivamente enviada ao Google Maps (paradas + CD final). */
  const sequenciaNavegacao = useMemo<Parada[]>(() => {
    if (!cd.trim()) return sequencia;
    return [
      ...sequencia,
      {
        id: "cd-final",
        ordem: sequencia.length + 1,
        cliente: "CD / ponto final",
        endereco: cd.trim(),
        nf: null,
        peso_kg: null,
        latitude: null,
        longitude: null,
        chegada_prevista: null,
      },
    ];
  }, [sequencia, cd]);

  const links = useMemo(() => trechos(sequenciaNavegacao), [sequenciaNavegacao]);
  const primeira = sequencia[0];

  if (!paradas.length) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Roteiro programado</h2>
          <p className="text-xs text-muted-foreground">
            {sequencia.length} paradas ·{" "}
            {alterada ? "sequência ajustada por você (salva)" : "sequência definida pela operação"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {alterada && (
            <Button size="sm" variant="ghost" onClick={restaurar}>
              <RotateCcw className="mr-2 size-4" /> Restaurar otimizada
            </Button>
          )}
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

      <p className="mb-2 text-[11px] text-muted-foreground">
        Use as setas (ou arraste no computador) para mudar a ordem das entregas. Sua sequência fica
        salva neste aparelho e o Google Maps abre exatamente nela.
      </p>

      <ol className="space-y-1">
        {sequencia.map((p, i) => (
          <li
            key={p.id}
            draggable
            onDragStart={() => setArrastando(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (arrastando !== null) mover(arrastando, i);
              setArrastando(null);
            }}
            className={`flex items-start gap-2 rounded-md border border-border p-2 text-xs ${
              arrastando === i ? "opacity-60" : ""
            }`}
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium break-words">
                {p.cliente || p.endereco.split(",")[0]}
                {p.nf ? ` · NF ${p.nf}` : ""}
              </span>
              <span className="flex items-start gap-1 text-muted-foreground">
                <MapPin className="mt-0.5 size-3 shrink-0" />
                <span className="min-w-0 break-words whitespace-pre-wrap">{p.endereco}</span>
              </span>
            </span>
            {p.chegada_prevista && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {p.chegada_prevista}
              </Badge>
            )}
            <span className="flex shrink-0 flex-col gap-1">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-6"
                aria-label={`Subir parada ${i + 1}`}
                disabled={i === 0}
                onClick={() => mover(i, i - 1)}
              >
                <ArrowUp className="size-3" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-6"
                aria-label={`Descer parada ${i + 1}`}
                disabled={i === sequencia.length - 1}
                onClick={() => mover(i, i + 1)}
              >
                <ArrowDown className="size-3" />
              </Button>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-3 space-y-1 rounded-md border border-dashed border-border p-2">
        <Label htmlFor={`cd-${viagemId}`} className="flex items-center gap-1 text-[11px]">
          <Warehouse className="size-3 text-brand" /> Último ponto (CD / base de entrega) — opcional
        </Label>
        <Input
          id={`cd-${viagemId}`}
          value={cd}
          onChange={(e) => atualizarCd(e.target.value)}
          placeholder="Ex.: CD Superfrio, Av. das Nações 1000, Guarulhos/SP"
          className="h-9 text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          {cd.trim()
            ? "Este endereço entra como destino final da rota no Google Maps."
            : "Se você termina o dia entregando em um CD, informe o endereço para entrar no fim da rota."}
        </p>
      </div>

      {links.length > 1 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          O Google Maps limita as paradas por link — abra os trechos em sequência para seguir todo o
          roteiro.
        </p>
      )}
    </Card>
  );
}
