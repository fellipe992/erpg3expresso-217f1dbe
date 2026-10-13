import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ImageIcon, Layers, Loader2, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { gerarCartoes } from "@/lib/treinador.functions";
import { streamImage } from "@/lib/stream-image";

function SeletorLivro({ livros, livro, setLivro }: { livros: string[]; livro: string; setLivro: (l: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {livros.map((l) => (
          <Button key={l} size="sm" className="h-auto max-w-full whitespace-normal py-2 text-left" variant={l === livro ? "default" : "outline"} onClick={() => setLivro(l)}>
            {l.split(" — ")[0]}
          </Button>
        ))}
      </div>
      <div className="space-y-1.5"><Label>Ou digite outro livro</Label><Input value={livro} onChange={(e) => setLivro(e.target.value)} /></div>
    </div>
  );
}

/* ---------------- Mapa visual ---------------- */
export function MapaVisual({ livros }: { livros: string[] }) {
  const qc = useQueryClient();
  const [livro, setLivro] = useState(livros[0]);
  const [pontos, setPontos] = useState("");
  const [img, setImg] = useState<string | null>(null);
  const [final, setFinal] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const salvos = useQuery({
    queryKey: ["treinador-mapas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treinador_historico")
        .select("id, titulo, resultado, created_at")
        .eq("tipo", "mapa")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const paths = data.map((d) => (d.resultado as { path: string }).path);
      const { data: urls } = paths.length
        ? await supabase.storage.from("treinador-mapas").createSignedUrls(paths, 3600)
        : { data: [] };
      return data.map((d, i) => ({ ...d, path: paths[i], url: urls?.[i]?.signedUrl ?? "" }));
    },
  });

  const gerar = async () => {
    setGerando(true); setImg(null); setFinal(false);
    try {
      let conteudo = pontos.trim();
      if (!conteudo) {
        // usa a última aula salva deste livro, se houver
        const { data } = await supabase.from("treinador_historico").select("resultado")
          .eq("tipo", "aula").eq("titulo", livro.slice(0, 200)).order("created_at", { ascending: false }).limit(1).maybeSingle();
        const r = data?.resultado as { resumo?: string; ideias_gerais?: { ideia: string; explicacao: string }[]; aplicacao_transporte?: { situacao: string; como_aplicar: string }[] } | undefined;
        if (r) {
          conteudo = [r.resumo, ...(r.ideias_gerais ?? []).map((i) => `• ${i.ideia}: ${i.explicacao}`),
            "No transporte:", ...(r.aplicacao_transporte ?? []).map((i) => `• ${i.situacao}: ${i.como_aplicar}`)].join("\n");
        } else conteudo = "Principais conceitos, palavras-chave e lições do livro, com aplicação em vendas de transporte.";
      }
      const { data: s } = await supabase.auth.getSession();
      await streamImage("/api/treinador-mapa", { livro, pontos: conteudo }, (url, f) => { setImg(url); setFinal(f); }, undefined,
        { Authorization: `Bearer ${s.session?.access_token ?? ""}` });
    } catch (e) {
      toast.error((e as Error).message.slice(0, 200));
    } finally { setGerando(false); }
  };

  const salvar = async () => {
    if (!img) return;
    setSalvando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const blob = await (await fetch(img)).blob();
      const path = `${u.user!.id}/${Date.now()}.png`;
      const up = await supabase.storage.from("treinador-mapas").upload(path, blob, { contentType: "image/png" });
      if (up.error) throw up.error;
      const { error } = await supabase.from("treinador_historico").insert({
        user_id: u.user!.id, tipo: "mapa", titulo: livro.slice(0, 200), entrada: { livro }, resultado: { path },
      });
      if (error) throw error;
      toast.success("Mapa salvo!");
      qc.invalidateQueries({ queryKey: ["treinador-mapas"] });
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  };

  const excluir = async (id: string, path: string) => {
    await supabase.storage.from("treinador-mapas").remove([path]);
    await supabase.from("treinador_historico").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["treinador-mapas"] });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ImageIcon className="size-5" /> Mapa visual do livro</CardTitle>
          <CardDescription>Gera uma imagem com as lições, palavras-chave e traduções. Se você já gerou a aula desse livro, ela é usada como base.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SeletorLivro livros={livros} livro={livro} setLivro={setLivro} />
          <div className="space-y-1.5"><Label>Pontos a incluir (opcional)</Label>
            <Textarea rows={3} value={pontos} onChange={(e) => setPontos(e.target.value)} placeholder="Ex.: as 4 etapas do SPIN com exemplos" /></div>
          <Button onClick={gerar} disabled={gerando || !livro.trim()}>
            {gerando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />} Gerar mapa visual
          </Button>
          {img && (
            <div className="space-y-2">
              <img src={img} alt={`Mapa visual de ${livro}`} className={`w-full rounded-lg border transition-[filter] ${final ? "blur-0" : "blur-2xl"}`} />
              {final && (
                <div className="flex gap-2">
                  <Button onClick={salvar} disabled={salvando}><Save className="mr-1.5 size-4" /> Salvar</Button>
                  <Button variant="outline" asChild><a href={img} download={`mapa-${livro.split(" — ")[0]}.png`}><Download className="mr-1.5 size-4" /> Baixar</a></Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Meus mapas salvos</CardTitle></CardHeader>
        <CardContent>
          {salvos.isLoading && <Loader2 className="size-4 animate-spin" />}
          {salvos.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum mapa salvo ainda.</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {salvos.data?.map((m) => (
              <div key={m.id} className="space-y-1 rounded-md border p-2">
                <a href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt={m.titulo} className="aspect-[3/2] w-full rounded object-cover" /></a>
                <div className="flex items-center gap-1">
                  <span className="flex-1 truncate text-xs">{m.titulo.split(" — ")[0]}</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2" asChild><a href={m.url} download><Download className="size-3" /></a></Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={() => excluir(m.id, m.path)}><Trash2 className="size-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Cartões de treino ---------------- */
type Cartao = { pergunta: string; alternativas: string[]; correta: number; explicacao: string };

export function CartoesTreino({ livros }: { livros: string[] }) {
  const fn = useServerFn(gerarCartoes);
  const [livro, setLivro] = useState(livros[0]);
  const [foco, setFoco] = useState("");
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [i, setI] = useState(0);
  const [escolha, setEscolha] = useState<number | null>(null);
  const [acertos, setAcertos] = useState(0);
  const [carregando, setCarregando] = useState(false);

  const gerar = async () => {
    setCarregando(true);
    try {
      const r = await fn({ data: { livro, foco } });
      setCartoes(r.cartoes); setI(0); setEscolha(null); setAcertos(0);
    } catch (e) { toast.error((e as Error).message); } finally { setCarregando(false); }
  };
  const c = cartoes[i];
  const virado = escolha !== null;
  const responder = (k: number) => { if (virado) return; setEscolha(k); if (k === c.correta) setAcertos((a) => a + 1); };
  const proximo = () => { setEscolha(null); setI((x) => x + 1); };
  const fim = cartoes.length > 0 && i >= cartoes.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Layers className="size-5" /> Cartões de treino</CardTitle>
          <CardDescription>Responda, o cartão vira e mostra se você acertou e por quê. Cada baralho fica salvo no histórico.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SeletorLivro livros={livros} livro={livro} setLivro={setLivro} />
          <div className="space-y-1.5"><Label>Foco (opcional)</Label><Input value={foco} onChange={(e) => setFoco(e.target.value)} placeholder="Ex.: objeção de preço" /></div>
          <Button onClick={gerar} disabled={carregando || !livro.trim()}>
            {carregando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />} Gerar baralho
          </Button>
        </CardContent>
      </Card>

      {c && !fim && (
        <div className="mx-auto max-w-xl space-y-3">
          <div className="flex justify-between text-xs text-muted-foreground"><span>Cartão {i + 1} de {cartoes.length}</span><span>{acertos} acertos</span></div>
          <div className="[perspective:1200px]">
            <div className={`relative min-h-72 transition-transform duration-500 [transform-style:preserve-3d] ${virado ? "[transform:rotateY(180deg)]" : ""}`}>
              <div className="absolute inset-0 space-y-3 rounded-xl border bg-card p-5 shadow-sm [backface-visibility:hidden]">
                <p className="font-semibold">{c.pergunta}</p>
                {c.alternativas.map((a, k) => (
                  <Button key={k} variant="outline" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => responder(k)}>{a}</Button>
                ))}
              </div>
              <div className={`absolute inset-0 space-y-3 rounded-xl border p-5 shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)] ${escolha === c.correta ? "border-primary bg-primary/10" : "border-destructive bg-destructive/10"}`}>
                <Badge variant={escolha === c.correta ? "default" : "destructive"}>{escolha === c.correta ? "Você acertou!" : "Você errou"}</Badge>
                <p className="text-sm"><b>Resposta certa:</b> {c.alternativas[c.correta]}</p>
                {escolha !== null && escolha !== c.correta && <p className="text-sm text-muted-foreground">Você marcou: {c.alternativas[escolha]}</p>}
                <p className="text-sm">{c.explicacao}</p>
                <Button onClick={proximo}>Próximo cartão</Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {fim && (
        <Card className="mx-auto max-w-xl"><CardContent className="space-y-3 pt-6 text-center">
          <p className="text-lg font-semibold">{acertos} de {cartoes.length} acertos</p>
          <Button variant="outline" onClick={() => { setI(0); setEscolha(null); setAcertos(0); }}><RotateCcw className="mr-1.5 size-4" /> Treinar de novo</Button>
        </CardContent></Card>
      )}
    </div>
  );
}
