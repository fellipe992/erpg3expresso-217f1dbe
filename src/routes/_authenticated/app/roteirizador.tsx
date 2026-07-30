import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Loader2,
  Printer,
  Route as RouteIcon,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { useProjetosRoteirizacao, type DadosProjeto } from "@/hooks/use-projetos-roteirizacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { DepositosPanel } from "@/components/roteirizador/depositos-panel";
import { EntregasPanel } from "@/components/roteirizador/entregas-panel";
import { FrotaPanel } from "@/components/roteirizador/frota-panel";
import { ImportarEntregasDialog } from "@/components/roteirizador/importar-entregas-dialog";
import { MapaRoteirizador } from "@/components/roteirizador/mapa-roteirizador";
import { RotasPanel } from "@/components/roteirizador/rotas-panel";
import { DashboardExecutivo } from "@/components/roteirizador/dashboard-executivo";
import { PainelIa } from "@/components/roteirizador/painel-ia";
import { RastreamentoPanel } from "@/components/roteirizador/rastreamento-panel";

import { FROTA_PADRAO, JORNADA_PADRAO, OPCOES_OTIMIZACAO_PADRAO } from "@/lib/roteirizacao/frota";
import { identificarRegioes, resumirRegioes } from "@/lib/roteirizacao/regioes";
import {
  cenarioDoPlano,
  dividirRota,
  excluirRota,
  gerarPlano,
  mesclarRotas,
  moverEntrega,
  otimizarRota,
  planoVazio,
  totaisPlano,
  type Plano,
} from "@/lib/roteirizacao/plano";
import { analisarCenario, aplicarSugestao, type Sugestao } from "@/lib/roteirizacao/ia";
import {
  exportarCarregamento,
  exportarResumo,
  exportarSequencia,
  imprimirRoteiro,
} from "@/lib/roteirizacao/exportar";
import { brl, duracao, num, pct } from "@/lib/roteirizacao/format";
import { kg } from "@/lib/roteirizacao/parse";
import type {
  Deposito,
  Entrega,
  OpcoesOtimizacao,
  PerfilVeiculo,
  RegrasJornada,
} from "@/lib/roteirizacao/tipos";

export const Route = createFileRoute("/_authenticated/app/roteirizador")({
  head: () => ({
    meta: [
      { title: "Roteirizador inteligente — G3 Expresso" },
      {
        name: "description",
        content:
          "Monte a malha de entregas no mapa, distribua a frota automaticamente, ajuste rotas manualmente e exporte roteiro e mapa de carregamento.",
      },
      { property: "og:title", content: "Roteirizador inteligente — G3 Expresso" },
      {
        property: "og:description",
        content: "Mapa protagonista, regiões automáticas, edição manual de rotas e projetos salvos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoteirizadorPage,
});

function RoteirizadorPage() {
  const { role } = useAuth();
  const isStaff = role === "administrador" || role === "gestor" || role === "financeiro";

  const [nomeProjeto, setNomeProjeto] = useState("Roteirização do dia");
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [frota, setFrota] = useState<PerfilVeiculo[]>(() =>
    FROTA_PADRAO.map((v) => ({ ...v, custos: { ...v.custos } })),
  );
  const [jornada, setJornada] = useState<RegrasJornada>({ ...JORNADA_PADRAO });
  const [opcoes, setOpcoes] = useState<OpcoesOtimizacao>({ ...OPCOES_OTIMIZACAO_PADRAO });
  const [plano, setPlano] = useState<Plano>(planoVazio);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [aba, setAba] = useState("entregas");
  const carregandoProjeto = useRef(false);

  const { projetos, projetoId, criar, salvar, autoSalvar, carregar, excluir, salvando, salvoEm } =
    useProjetosRoteirizacao();

  const definirEntregas = useCallback((lista: Entrega[]) => {
    setEntregas(identificarRegioes(lista));
  }, []);

  const dados: DadosProjeto = useMemo(
    () => ({ depositos, entregas, frota, jornada, opcoes, plano }),
    [depositos, entregas, frota, jornada, opcoes, plano],
  );

  useEffect(() => {
    if (carregandoProjeto.current) {
      carregandoProjeto.current = false;
      return;
    }
    autoSalvar(dados);
  }, [dados, autoSalvar]);

  const totais = useMemo(() => totaisPlano(plano), [plano]);
  const regioes = useMemo(() => resumirRegioes(entregas), [entregas]);
  const cenario = useMemo(() => cenarioDoPlano(plano), [plano]);
  const sugestoes = useMemo(
    () => (plano.rotas.length ? analisarCenario(cenario, [cenario], jornada) : []),
    [cenario, jornada, plano.rotas.length],
  );

  const roteirizar = () => {
    if (!depositos.length) return toast.error("Cadastre ao menos um centro de distribuição");
    if (entregas.length < 2) return toast.error("Adicione ao menos 2 entregas");
    setCalculando(true);
    setTimeout(() => {
      try {
        const novo = gerarPlano({ entregas, depositos, frota, jornada, opcoes });
        setPlano(novo);
        setOcultas(new Set());
        setAba("rotas");
        toast.success("Malha roteirizada", {
          description: `${novo.rotas.length} rota(s) · ${totaisPlano(novo).km.toFixed(0)} km`,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao roteirizar");
      } finally {
        setCalculando(false);
      }
    }, 30);
  };

  const salvarProjeto = async () => {
    if (projetoId) {
      await salvar(dados, nomeProjeto);
      toast.success("Projeto salvo");
      return;
    }
    const id = await criar(nomeProjeto, dados);
    if (id) toast.success("Projeto criado — alterações salvas automaticamente");
  };

  const abrirProjeto = async (id: string, nome: string) => {
    const d = await carregar(id);
    if (!d) return;
    carregandoProjeto.current = true;
    setNomeProjeto(nome);
    setDepositos(d.depositos ?? []);
    setEntregas(d.entregas ?? []);
    setFrota(d.frota ?? FROTA_PADRAO);
    setJornada(d.jornada ?? JORNADA_PADRAO);
    setOpcoes(d.opcoes ?? { ...OPCOES_OTIMIZACAO_PADRAO });
    setPlano(d.plano ?? planoVazio());
    setAba("rotas");
    toast.success(`Projeto “${nome}” carregado`);
  };

  const onAplicarSugestao = (s: Sugestao) => {
    const cd = plano.rotas[0]?.deposito ?? depositos[0];
    if (!cd) return;
    const novo = aplicarSugestao(cenario, s, { deposito: cd, jornada });
    setPlano((p) => ({ ...p, rotas: novo.rotas, naoAtendidas: novo.entregasNaoAtendidas }));
    toast.success("Melhoria aplicada");
  };

  const toggleVisibilidade = (rotaId: string) =>
    setOcultas((s) => {
      const novo = new Set(s);
      if (novo.has(rotaId)) novo.delete(rotaId);
      else novo.add(rotaId);
      return novo;
    });

  if (!isStaff) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Você não tem permissão para acessar o roteirizador.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <h1 className="text-2xl font-semibold">Roteirizador inteligente</h1>
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={nomeProjeto}
              onChange={(e) => setNomeProjeto(e.target.value)}
              className="h-8 max-w-xs text-sm"
              aria-label="Nome do projeto"
            />
            <span className="text-xs text-muted-foreground">
              {salvando ? "Salvando…" : salvoEm ? `Salvo ${new Date(salvoEm).toLocaleTimeString("pt-BR")}` : "Não salvo"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <FolderOpen className="mr-2 size-4" /> Projetos
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Projetos salvos</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projetos.length === 0 && (
                <DropdownMenuItem disabled>Nenhum projeto salvo</DropdownMenuItem>
              )}
              {projetos.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    void abrirProjeto(p.id, p.nome);
                  }}
                  className="flex items-center gap-2"
                >
                  <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                  <Trash2
                    className="size-3.5 text-muted-foreground hover:text-destructive"
                    role="button"
                    aria-label={`Excluir ${p.nome}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      void excluir(p.id);
                    }}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={salvarProjeto}>
            <Save className="mr-2 size-4" /> Salvar
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={!plano.rotas.length}>
                <Download className="mr-2 size-4" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportarSequencia(plano, nomeProjeto)}>
                Sequência de entregas (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportarCarregamento(plano, nomeProjeto)}>
                Mapa de carregamento (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportarResumo(plano, nomeProjeto)}>
                Resumo gerencial (Excel)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => imprimirRoteiro(plano, nomeProjeto)}>
                <Printer className="mr-2 size-4" /> Roteiro para impressão / PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-2 size-4" /> Frota e custos
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
              <SheetHeader>
                <SheetTitle>Frota, custos e jornada</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <FrotaPanel
                  frota={frota}
                  onChange={setFrota}
                  jornada={jornada}
                  onJornada={setJornada}
                  opcoes={opcoes}
                  onOpcoes={setOpcoes}
                />
              </div>
            </SheetContent>
          </Sheet>

          <Button onClick={roteirizar} disabled={calculando}>
            {calculando ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <RouteIcon className="mr-2 size-4" />
            )}
            Roteirizar
          </Button>
        </div>
      </header>

      {plano.rotas.length > 0 && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          {[
            ["Veículos", num(totais.veiculos)],
            ["Entregas", num(totais.entregas)],
            ["Distância", `${num(totais.km)} km`],
            ["Operação", duracao(totais.minutosOperacao)],
            ["Ocupação média", pct(totais.ocupacaoMedia)],
            ["Custo total", brl(totais.custo)],
          ].map(([label, valor]) => (
            <Card key={label} className="p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="text-base font-semibold">{valor}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,32%)_1fr]">
        <div className="order-2 space-y-3 lg:order-1">
          <Tabs value={aba} onValueChange={setAba}>
            <TabsList className="w-full">
              <TabsTrigger value="entregas" className="flex-1">
                Entregas
              </TabsTrigger>
              <TabsTrigger value="rotas" className="flex-1">
                Rotas {plano.rotas.length ? `(${plano.rotas.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="bases" className="flex-1">
                Bases
              </TabsTrigger>
            </TabsList>

            <TabsContent value="entregas" className="mt-3">
              <Card className="p-3">
                <EntregasPanel
                  entregas={entregas}
                  onChange={definirEntregas}
                  onImportar={() => setImportando(true)}
                  selecionada={selecionada}
                  onSelecionar={setSelecionada}
                />
              </Card>
            </TabsContent>

            <TabsContent value="rotas" className="mt-3">
              <RotasPanel
                plano={plano}
                ocultas={ocultas}
                onToggleVisibilidade={toggleVisibilidade}
                selecionada={selecionada}
                onSelecionar={setSelecionada}
                onMover={(entregaId, rotaId, posicao) =>
                  setPlano((p) => moverEntrega(p, entregaId, rotaId, jornada, posicao))
                }
                onOtimizar={(id) => setPlano((p) => otimizarRota(p, id, jornada))}
                onDividir={(id) => setPlano((p) => dividirRota(p, id, jornada))}
                onMesclar={(o, d) => setPlano((p) => mesclarRotas(p, o, d, jornada))}
                onExcluir={(id) => setPlano((p) => excluirRota(p, id))}
              />
            </TabsContent>

            <TabsContent value="bases" className="mt-3">
              <Card className="p-3">
                <DepositosPanel depositos={depositos} onChange={setDepositos} />
              </Card>
            </TabsContent>
          </Tabs>

          {regioes.length > 0 && (
            <Card className="p-3">
              <p className="mb-2 text-sm font-semibold">Regiões identificadas</p>
              <ul className="space-y-1">
                {regioes.map((r) => (
                  <li key={r.codigo} className="flex items-center gap-2 text-xs">
                    <span className="size-3 rounded-full" style={{ backgroundColor: r.cor }} aria-hidden />
                    <span className="flex-1">{r.rotulo}</span>
                    <Badge variant="outline" className="text-[10px]">{r.entregas} entregas</Badge>
                    <span className="text-muted-foreground">{kg(r.pesoKg)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="order-1 lg:order-2">
          <div className="h-[60vh] lg:sticky lg:top-4 lg:h-[calc(100vh-9rem)]">
            <MapaRoteirizador
              entregas={entregas}
              depositos={depositos}
              rotas={plano.rotas}
              ocultas={ocultas}
              selecionada={selecionada}
              onSelecionarEntrega={setSelecionada}
              onSoltarEmRota={(entregaId, rotaId) =>
                setPlano((p) => moverEntrega(p, entregaId, rotaId, jornada))
              }
            />
          </div>
        </div>
      </div>

      {plano.rotas.length > 0 && (
        <Tabs defaultValue="dashboard">
          <TabsList className="flex-wrap">
            <TabsTrigger value="dashboard">
              <Truck className="mr-2 size-4" /> Dashboard executivo
            </TabsTrigger>
            <TabsTrigger value="ia">
              <Sparkles className="mr-2 size-4" /> Assistente
            </TabsTrigger>
            <TabsTrigger value="execucao">Execução</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-4">
            <DashboardExecutivo cenario={cenario} impostoPct={0} administrativoPct={0} />
          </TabsContent>
          <TabsContent value="ia" className="mt-4">
            <PainelIa sugestoes={sugestoes} onAplicar={onAplicarSugestao} />
          </TabsContent>
          <TabsContent value="execucao" className="mt-4">
            <RastreamentoPanel cenario={cenario} progresso={{}} />
          </TabsContent>
        </Tabs>
      )}

      <ImportarEntregasDialog
        open={importando}
        onOpenChange={setImportando}
        onImportar={(novas) => definirEntregas([...entregas, ...novas])}
      />

    </div>
  );
}
