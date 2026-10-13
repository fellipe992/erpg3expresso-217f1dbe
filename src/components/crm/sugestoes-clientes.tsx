import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Network, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { buscarEmpresasNoNavegador, type EmpresaBruta } from "@/lib/hunter-places-browser";
import { mapearOrganograma, pontuarSugestoes, type Organograma, type Sugestao } from "@/lib/sugestoes.functions";

const PERFIS: Record<string, string[]> = {
  "CARGA SECA": ["indústria alimentícia", "distribuidora atacadista", "indústria de embalagens"],
  "CADEIA DO FRIO": ["frigorífico", "laticínio", "distribuidora de congelados"],
  ARMAZENAGEM: ["centro de distribuição", "e-commerce distribuidor", "indústria de bens de consumo"],
};

type Item = EmpresaBruta & Partial<Sugestao>;

const linkedin = (termo: string, empresa: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${termo} ${empresa}`)}`;

export function SugestoesClientes() {
  const pontuar = useServerFn(pontuarSugestoes);
  const mapear = useServerFn(mapearOrganograma);
  const [perfil, setPerfil] = useState("CARGA SECA");
  const [cidade, setCidade] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [alvo, setAlvo] = useState<Item | null>(null);
  const [org, setOrg] = useState<Organograma | null>(null);
  const [mapeando, setMapeando] = useState(false);

  const buscar = async () => {
    if (!cidade.trim()) return toast.error("Informe a cidade/região.");
    setCarregando(true);
    setItens([]);
    try {
      const vistos = new Map<string, EmpresaBruta>();
      for (const kw of PERFIS[perfil]) {
        const r = await buscarEmpresasNoNavegador({ cidade: cidade.trim(), keyword: kw, raioKm: 40 }).catch(() => []);
        r.forEach((e) => vistos.set(e.place_id, e));
      }
      const cand = [...vistos.values()].slice(0, 25);
      if (!cand.length) return toast.info("Nenhuma empresa encontrada nessa região.");
      const { sugestoes } = await pontuar({ data: { perfil, candidatos: cand } });
      const lista: Item[] = cand.map((c, i) => ({ ...c, ...sugestoes.find((s) => s.indice === i) }));
      setItens(lista.sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao buscar sugestões.");
    } finally {
      setCarregando(false);
    }
  };

  const abrirOrg = async (it: Item) => {
    setAlvo(it);
    setOrg(null);
    setMapeando(true);
    try {
      setOrg(await mapear({ data: { empresa: it.nome, segmento: it.segmento ?? "", perfil } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao mapear.");
    } finally {
      setMapeando(false);
    }
  };

  const copiar = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success("Copiado"));

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <Badge>Sugestões</Badge>
          <span className="text-sm font-medium">Clientes recomendados para o perfil da G3</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.keys(PERFIS).map((p) => (
            <Button key={p} size="sm" variant={perfil === p ? "default" : "outline"} onClick={() => setPerfil(p)}>
              {p}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="Cidade ou região (ex.: CAMPINAS, SP)" value={cidade} onChange={(e) => setCidade(e.target.value.toUpperCase())} />
          <Button onClick={buscar} disabled={carregando}>
            {carregando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Sugerir
          </Button>
        </div>
        {itens.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {itens.map((it) => (
              <div key={it.place_id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{it.nome}</p>
                    <p className="text-xs text-muted-foreground">{it.endereco}</p>
                  </div>
                  <Badge variant={(it.fit ?? 0) >= 70 ? "default" : "secondary"}>Fit {Math.round(it.fit ?? 0)}</Badge>
                </div>
                {it.segmento && <p className="text-xs"><b>Segmento:</b> {it.segmento}</p>}
                {it.motivo && <p className="text-xs text-muted-foreground">{it.motivo}</p>}
                {it.dor_provavel && <p className="text-xs"><b>Dor provável:</b> {it.dor_provavel}</p>}
                <Button size="sm" variant="outline" onClick={() => abrirOrg(it)}>
                  <Network className="size-4" /> Mapear pessoas
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={!!alvo} onOpenChange={(o) => !o && setAlvo(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Organograma — {alvo?.nome}</SheetTitle>
            <SheetDescription>
              Cargos a abordar do operacional à diretoria. O botão LinkedIn abre a busca de pessoas reais dessa empresa no cargo.
            </SheetDescription>
          </SheetHeader>
          {mapeando && <Loader2 className="mx-auto my-8 size-6 animate-spin" />}
          {org && (
            <div className="space-y-4 p-4">
              <p className="text-sm">{org.resumo}</p>
              {org.niveis.map((n) => (
                <div key={n.nivel} className="space-y-2">
                  <h3 className="font-display font-semibold">{n.nivel}</h3>
                  <p className="text-xs text-muted-foreground">{n.estrategia}</p>
                  {n.cargos.map((c) => (
                    <div key={c.cargo} className="space-y-1 rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <b>{c.cargo}</b>
                        <Button size="sm" variant="ghost" asChild>
                          <a href={linkedin(c.termo_busca, alvo?.nome ?? "")} target="_blank" rel="noreferrer">
                            LinkedIn <ExternalLink className="size-3" />
                          </a>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.o_que_importa}</p>
                      <p className="text-xs"><b>Pergunta:</b> {c.pergunta}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => copiar(c.gancho_linkedin)}>
                          <Copy className="size-3" /> Convite LinkedIn
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copiar(c.gancho_whatsapp)}>
                          <Copy className="size-3" /> WhatsApp
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
