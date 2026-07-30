import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntregasPanel } from "@/components/roteirizador/entregas-panel";
import { FrotaPanel } from "@/components/roteirizador/frota-panel";
import { ComparadorCenarios } from "@/components/roteirizador/comparador-cenarios";
import { DashboardExecutivo } from "@/components/roteirizador/dashboard-executivo";
import { PainelIa } from "@/components/roteirizador/painel-ia";
import { RastreamentoPanel } from "@/components/roteirizador/rastreamento-panel";
import { FROTA_PADRAO, JORNADA_PADRAO } from "@/lib/roteirizacao/frota";
import { simularCenarios } from "@/lib/roteirizacao/cenarios";
import { analisarCenario, aplicarSugestao, type Sugestao } from "@/lib/roteirizacao/ia";
import type { Cenario, Deposito, Entrega, PerfilVeiculo, RegrasJornada, TipoCenario } from "@/lib/roteirizacao/tipos";

export const Route = createFileRoute("/_authenticated/app/roteirizador")({
  head: () => ({
    meta: [
      { title: "Roteirizador inteligente — G3 Expresso" },
      {
        name: "description",
        content:
          "Gere cenários de roteirização, compare custo, tempo, ocupação e quilometragem e aplique o melhor plano de entregas da frota.",
      },
      { property: "og:title", content: "Roteirizador inteligente — G3 Expresso" },
      {
        property: "og:description",
        content: "Simulação de cenários, custos operacionais, KPIs logísticos e recomendações automáticas.",
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

  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [deposito, setDeposito] = useState<Deposito | null>(null);
  const [frota, setFrota] = useState<PerfilVeiculo[]>(() =>
    FROTA_PADRAO.map((v) => ({ ...v, custos: { ...v.custos } })),
  );
  const [jornada, setJornada] = useState<RegrasJornada>({ ...JORNADA_PADRAO });
  const [receita, setReceita] = useState("");
  const [impostoPct, setImpostoPct] = useState("8");
  const [adminPct, setAdminPct] = useState("5");

  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [selecionado, setSelecionado] = useState<TipoCenario | null>(null);
  const [aplicado, setAplicado] = useState<Cenario | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [aba, setAba] = useState("entregas");

  const cenarioAtual = useMemo(
    () => aplicado ?? cenarios.find((c) => c.id === selecionado) ?? cenarios.find((c) => c.recomendado) ?? null,
    [aplicado, cenarios, selecionado],
  );

  const sugestoes = useMemo(
    () => (cenarioAtual ? analisarCenario(cenarioAtual, cenarios, jornada) : []),
    [cenarioAtual, cenarios, jornada],
  );

  const baseline = useMemo(
    () => (cenarios.length ? cenarios.reduce((a, b) => (b.custo > a.custo ? b : a)) : undefined),
    [cenarios],
  );

  const gerar = () => {
    if (!deposito) return toast.error("Defina a base de saída antes de simular");
    if (entregas.length < 2) return toast.error("Adicione ao menos 2 entregas");
    setCalculando(true);
    setTimeout(() => {
      try {
        const { cenarios: gerados, recomendado } = simularCenarios({
          entregas,
          deposito,
          frota,
          jornada,
          receitaTotal: receita ? Number(receita) : undefined,
        });
        setCenarios(gerados);
        setSelecionado(recomendado);
        setAplicado(null);
        setAba("cenarios");
        toast.success("Cenários gerados", { description: `Recomendado: ${gerados.find((c) => c.recomendado)?.nome}` });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao simular cenários");
      } finally {
        setCalculando(false);
      }
    }, 30);
  };

  const onAplicarSugestao = (s: Sugestao) => {
    if (!cenarioAtual || !deposito) return;
    if (s.acao?.tipo === "trocar_cenario") {
      setSelecionado(s.acao.alvo);
      setAplicado(null);
      toast.success("Cenário alternativo selecionado");
      return;
    }
    const novo = aplicarSugestao(cenarioAtual, s, { deposito, jornada });
    setAplicado(novo);
    toast.success("Melhoria aplicada à roteirização");
  };

  if (!isStaff) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Você não tem permissão para acessar o roteirizador.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Roteirizador inteligente</h1>
          <p className="text-sm text-muted-foreground">
            Simule cenários de distribuição, compare custo, tempo e ocupação e aplique o melhor plano.
          </p>
        </div>
        <Button onClick={gerar} disabled={calculando}>
          {calculando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Simular cenários
        </Button>
      </header>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="entregas">Entregas</TabsTrigger>
          <TabsTrigger value="frota">Frota e custos</TabsTrigger>
          <TabsTrigger value="cenarios">Cenários</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard executivo</TabsTrigger>
          <TabsTrigger value="rastreamento">Execução</TabsTrigger>
        </TabsList>

        <TabsContent value="entregas" className="mt-4 space-y-4">
          <EntregasPanel
            entregas={entregas}
            onChange={setEntregas}
            deposito={deposito}
            onDeposito={setDeposito}
          />
          <Card className="grid gap-3 p-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Receita prevista total (R$)</Label>
              <Input inputMode="decimal" value={receita} onChange={(e) => setReceita(e.target.value)} placeholder="Opcional se informada por entrega" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Impostos sobre receita (%)</Label>
              <Input inputMode="decimal" value={impostoPct} onChange={(e) => setImpostoPct(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Rateio administrativo (%)</Label>
              <Input inputMode="decimal" value={adminPct} onChange={(e) => setAdminPct(e.target.value)} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="frota" className="mt-4">
          <FrotaPanel frota={frota} onChange={setFrota} jornada={jornada} onJornada={setJornada} />
        </TabsContent>

        <TabsContent value="cenarios" className="mt-4 space-y-4">
          {cenarios.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Cadastre as entregas e clique em “Simular cenários”.
            </Card>
          ) : (
            <>
              <ComparadorCenarios
                cenarios={cenarios}
                selecionado={cenarioAtual?.id ?? null}
                onSelecionar={(id) => {
                  setSelecionado(id);
                  setAplicado(null);
                }}
                onAplicar={(c) => {
                  setSelecionado(c.id);
                  setAplicado(c);
                  setAba("dashboard");
                  toast.success(`Cenário "${c.nome}" aplicado`);
                }}
              />
              <PainelIa sugestoes={sugestoes} onAplicar={onAplicarSugestao} />
            </>
          )}
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          {cenarioAtual ? (
            <DashboardExecutivo
              cenario={cenarioAtual}
              baseline={baseline}
              receita={receita ? Number(receita) : undefined}
              impostoPct={Number(impostoPct) || 0}
              administrativoPct={Number(adminPct) || 0}
            />
          ) : (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Gere os cenários para ver o dashboard executivo.
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rastreamento" className="mt-4">
          {cenarioAtual ? (
            <RastreamentoPanel cenario={cenarioAtual} progresso={{}} />
          ) : (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              Aplique um cenário para acompanhar a execução.
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
