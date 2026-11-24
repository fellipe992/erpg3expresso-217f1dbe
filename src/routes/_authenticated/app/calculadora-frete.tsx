import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calculator, CheckCircle2, Info, Scale, Sparkles, TrendingUp, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  calcularPisoAntt,
  calcularReferenciaMercado,
  EIXOS,
  eixosSugeridos,
  TABELAS,
  TIPOS_CARGA,
  versaoVigente,
  type Eixos,
  type TabelaAntt,
  type TipoCargaAntt,
} from "@/lib/frete-antt";

export const Route = createFileRoute("/_authenticated/app/calculadora-frete")({
  head: () => ({ meta: [{ title: "Calculadora de frete mínimo ANTT — G3 Expresso" }, { name: "description", content: "Calcule o piso mínimo de frete da ANTT por categoria de veículo antes de emitir documentos." }] }),
  component: CalculadoraFrete,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const NENHUM = "__categoria__";

function CalculadoraFrete() {
  const { data: veiculos = [] } = useQuery({
    queryKey: ["calc-frete-veiculos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos").select("id, placa, tipo, modelo").order("placa");
      if (error) throw error;
      return data ?? [];
    },
  });
  const categorias = useMemo(() => Array.from(new Set(veiculos.map((v) => v.tipo as string))).sort(), [veiculos]);

  const [veiculoId, setVeiculoId] = useState(NENHUM);
  const [categoria, setCategoria] = useState("");
  const [eixos, setEixos] = useState<Eixos>(2);
  const [lotacao, setLotacao] = useState(true);
  const [somenteAutomotor, setSomenteAutomotor] = useState(false);
  const [altoDesempenho, setAltoDesempenho] = useState(false);
  const [tipoCarga, setTipoCarga] = useState<TipoCargaAntt>("carga_geral");
  const [km, setKm] = useState("");
  const [retornoVazio, setRetornoVazio] = useState(false);
  const [kmRetorno, setKmRetorno] = useState("");
  const [frete, setFrete] = useState("");
  const [calculado, setCalculado] = useState(false);

  const tabela: TabelaAntt = somenteAutomotor ? (altoDesempenho ? "D" : "B") : altoDesempenho ? "C" : "A";
  const escolherCategoria = (c: string) => { setCategoria(c); setEixos(eixosSugeridos(c)); };
  const escolherVeiculo = (id: string) => {
    setVeiculoId(id);
    const v = veiculos.find((x) => x.id === id);
    if (v) escolherCategoria(v.tipo as string);
  };

  const r = calcularPisoAntt({
    lotacao, tabela, tipoCarga, eixos, km: num(km), retornoVazio,
    kmRetorno: kmRetorno ? num(kmRetorno) : undefined, freteCombinado: frete ? num(frete) : null,
  });
  const mercado = r.aplica ? calcularReferenciaMercado(r.piso, num(km)) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Scale className="size-6 text-brand" /> Calculadora de frete mínimo (ANTT)</h1>
        <p className="text-sm text-muted-foreground">Coeficientes da {versaoVigente().resolucao}, em vigor desde {versaoVigente().vigenciaInicio.split("-").reverse().join("/")}. Confira no site da ANTT se houve reajuste por variação do diesel.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card className="space-y-4 p-4">
          <Pergunta n={1} titulo="É carga lotação?" ajuda="Uma carga só, de um único contratante, ocupando o veículo. Várias notas de clientes diferentes (fracionada) não têm piso.">
            <div className="flex items-center gap-2"><Switch checked={lotacao} onCheckedChange={setLotacao} /><span className="text-sm">{lotacao ? "Sim, lotação" : "Não, fracionada"}</span></div>
          </Pergunta>

          <Pergunta n={2} titulo="Qual veículo?" ajuda="Escolha um veículo da frota ou só a categoria. O piso é por número de eixos carregados do conjunto.">
            <div className="grid gap-2 sm:grid-cols-3">
              <Select value={veiculoId} onValueChange={escolherVeiculo}>
                <SelectTrigger><SelectValue placeholder="Veículo da frota" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Sem veículo específico</SelectItem>
                  {veiculos.map((v) => <SelectItem key={v.id} value={v.id}>{v.placa} · {String(v.tipo).toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categoria} onValueChange={(c) => { setVeiculoId(NENHUM); escolherCategoria(c); }}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>{categorias.map((c) => <SelectItem key={c} value={c}>{c.toUpperCase()}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(eixos)} onValueChange={(e) => setEixos(Number(e) as Eixos)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EIXOS.map((e) => <SelectItem key={e} value={String(e)}>{e} eixos</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </Pergunta>

          <Pergunta n={3} titulo="Qual o tipo de carga?">
            <Select value={tipoCarga} onValueChange={(v) => setTipoCarga(v as TipoCargaAntt)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS_CARGA.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}{t.exemplo ? ` — ${t.exemplo}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </Pergunta>

          <Pergunta n={4} titulo="Como é a contratação?" ajuda={TABELAS.find((t) => t.id === tabela)?.descricao}>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><Switch checked={somenteAutomotor} onCheckedChange={setSomenteAutomotor} /> Só o veículo automotor (sem implemento)</label>
              <label className="flex items-center gap-2"><Switch checked={altoDesempenho} onCheckedChange={setAltoDesempenho} /> Alto desempenho</label>
            </div>
            <p className="mt-1 text-xs font-semibold">{TABELAS.find((t) => t.id === tabela)?.nome}</p>
          </Pergunta>

          <Pergunta n={5} titulo="Distância e retorno">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1"><Label className="text-xs">Distância da viagem (km)</Label><Input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="Ex.: 450" /></div>
              <label className="flex items-end gap-2 pb-2 text-sm"><Switch checked={retornoVazio} onCheckedChange={setRetornoVazio} /> Volta vazio</label>
              {retornoVazio && <div className="space-y-1"><Label className="text-xs">Km do retorno (padrão = ida)</Label><Input inputMode="decimal" value={kmRetorno} onChange={(e) => setKmRetorno(e.target.value)} placeholder={km || "km"} /></div>}
            </div>
          </Pergunta>

          <Pergunta n={6} titulo="Frete combinado (opcional)" ajuda="Valor do frete sem pedágio e sem impostos, para comparar com o piso.">
            <Input inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} placeholder="R$" className="max-w-xs" />
          </Pergunta>

          <div className="pt-2">
            <Button type="button" onClick={() => setCalculado(true)} className="w-full sm:w-auto">
              <Calculator className="mr-2 size-4" /> Calcular piso e sugestão de frete
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">Resultado</h2>
            {!calculado && !km ? (
              <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <Info className="size-4 shrink-0" /> Preencha a distância e clique em <strong>Calcular piso e sugestão de frete</strong> para ver o piso mínimo, a faixa de mercado e o valor sugerido ao motorista.
              </div>
            ) : !r.aplica ? (
              <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm"><Info className="size-4 shrink-0" />{r.motivo}</div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Piso mínimo (não aplicar abaixo)</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{brl(r.piso)}</p>
                  </div>
                  {mercado && (
                    <div className="rounded-lg border p-3">
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp className="size-3.5" /> Praticado no mercado
                      </p>
                      <p className="mt-1 text-sm font-bold tabular-nums">
                        {brl(mercado.mercadoMin)} a {brl(mercado.mercadoMax)}
                      </p>
                    </div>
                  )}
                  {mercado && (
                    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                      <p className="flex items-center gap-1 text-xs font-medium text-primary">
                        <Sparkles className="size-3.5" /> Sugestão p/ motorista (+{mercado.percentualSugerido}%)
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-primary">{brl(mercado.sugeridoMotorista)}</p>
                    </div>
                  )}
                </div>
                {mercado && (
                  <p className="text-xs text-muted-foreground">
                    {mercado.faixaDescricao} Oferecer <strong>{brl(mercado.sugeridoMotorista)}</strong> aumenta a assertividade de aceite mantendo conformidade legal.
                  </p>
                )}
                <Linha k={`Deslocamento: ${r.ccd.toLocaleString("pt-BR", { minimumFractionDigits: 4 })} R$/km × ${num(km).toLocaleString("pt-BR")} km`} v={brl(r.valorDeslocamento)} />
                <Linha k="Carga e descarga (CC)" v={brl(r.cc)} />
                {r.valorRetorno > 0 && <Linha k="Retorno vazio (0,92 × CCD × km)" v={brl(r.valorRetorno)} />}
                <div className="flex justify-between border-t border-border pt-2 text-lg font-bold"><span>Piso mínimo</span><span className="tabular-nums">{brl(r.piso)}</span></div>
                {r.dentroDoPiso != null && (
                  <div className={`flex items-center gap-2 rounded-lg p-3 text-sm font-semibold ${r.dentroDoPiso ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {r.dentroDoPiso ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                    {r.dentroDoPiso ? `Dentro do piso (${brl(r.diferenca!)} acima)` : `Abaixo do piso — faltam ${brl(-r.diferenca!)}`}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Pedágio (vale-pedágio) e impostos não entram no piso e são cobrados à parte. {r.resolucao}.</p>
              </>
            )}
          </Card>

          <Card className="space-y-3 p-4 text-sm">
            <h2 className="font-semibold">Guia rápido</h2>
            <div><p className="font-semibold">Onde se aplica</p><p className="text-muted-foreground">Transporte rodoviário remunerado de carga lotação, feito por empresa (ETC), cooperativa (CTC) ou autônomo (TAC), em qualquer distância, inclusive dentro do estado.</p></div>
            <div><p className="font-semibold">Onde não se aplica</p><p className="text-muted-foreground">Carga fracionada (várias notas/contratantes no mesmo veículo, típico de distribuição urbana), transporte com veículo próprio do dono da carga (carga própria) e operações não remuneradas.</p></div>
            <div><p className="font-semibold">Informações necessárias</p><p className="text-muted-foreground">Número de eixos carregados, tipo de carga, se contrata o conjunto ou só o automotor, se é alto desempenho, distância em km e se o veículo volta vazio.</p></div>
            <div><p className="font-semibold">Tabelas</p><p className="text-muted-foreground">A: lotação. B: só o automotor. C: lotação de alto desempenho. D: só o automotor de alto desempenho.</p></div>
            <div><p className="font-semibold">Se ficar abaixo</p><p className="text-muted-foreground">Quem contrata abaixo do piso pode ser multado pela ANTT e indenizar o transportador em até o dobro da diferença (Lei 13.703/2018).</p></div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Pergunta({ n, titulo, ajuda, children }: { n: number; titulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold"><span className="mr-2 inline-grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{n}</span>{titulo}</p>
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
      {children}
    </div>
  );
}
function Linha({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2 text-sm"><span className="text-muted-foreground">{k}</span><span className="tabular-nums">{v}</span></div>;
}
