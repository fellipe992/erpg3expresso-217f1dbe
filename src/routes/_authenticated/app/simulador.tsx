import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bike,
  Car,
  Clock,
  Fuel,
  Loader2,
  MapPinned,
  Plus,
  Route as RouteIcon,
  Save,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LocalInput } from "@/components/planejador/local-input";
import { MapaRota } from "@/components/planejador/mapa-rota";
import {
  DemonstrativoViagem,
  brl,
  calcularProvisao,
  num,
} from "@/components/viagem/demonstrativo-viagem";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/simulador")({
  head: () => ({
    meta: [
      { title: "Planejador de viagens — G3 Expresso" },
      {
        name: "description",
        content:
          "Calcule rota, distância, tempo, combustível e pedágios por eixo e veja o resultado financeiro da viagem antes de fechar o frete.",
      },
      { property: "og:title", content: "Planejador de viagens — G3 Expresso" },
      {
        property: "og:description",
        content: "Rota, pedágios por eixo, combustível e lucro estimado da viagem em uma tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanejadorPage,
});

type Trecho = { indice: number; de: string; para: string; km: number; minutos: number; pedagio: number };
type Resultado = {
  km: number;
  minutos: number;
  polyline: string;
  pedagioTotal: number;
  trechos: Trecho[];
  fatorEixos: number;
};

const VEICULOS = [
  { id: "moto", nome: "Moto", icon: Bike, eixos: 2 },
  { id: "carro", nome: "Carro", icon: Car, eixos: 2 },
  { id: "van", nome: "Van / Utilitário", icon: Car, eixos: 2 },
  { id: "caminhao", nome: "Caminhão", icon: Truck, eixos: 3 },
  { id: "carreta", nome: "Carreta", icon: Truck, eixos: 6 },
];

const formatarDuracao = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
};

const cidadeUf = (endereco: string) => {
  const partes = endereco.split(",").map((p) => p.trim());
  const uf = partes.find((p) => /^[A-Z]{2}$/.test(p.replace(/\s*-\s*Brasil$/i, "").trim()));
  const matchUf = endereco.match(/\b([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);
  return { cidade: partes[0] ?? endereco, uf: (uf ?? matchUf?.[1] ?? "").slice(0, 2) };
};

function PlanejadorPage() {
  const { role } = useAuth();
  const isStaff = role === "administrador" || role === "gestor" || role === "financeiro";
  const queryClient = useQueryClient();

  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [paradas, setParadas] = useState<string[]>([]);
  const [tipoRota, setTipoRota] = useState<"eficiente" | "curta" | "sem_pedagio">("eficiente");
  const [tipoVeiculo, setTipoVeiculo] = useState("carreta");
  const [eixos, setEixos] = useState(6);

  const [veiculoId, setVeiculoId] = useState("__none");
  const [consumo, setConsumo] = useState("2.5");
  const [precoDiesel, setPrecoDiesel] = useState("6.20");
  const [frete, setFrete] = useState("");
  const [comissaoPct, setComissaoPct] = useState("10");
  const [pedagioManual, setPedagioManual] = useState("");
  const [outros, setOutros] = useState("");
  const [manutKm, setManutKm] = useState("");
  const [pneusKm, setPneusKm] = useState("");

  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [converterOpen, setConverterOpen] = useState(false);
  const [clienteId, setClienteId] = useState("__none");
  const [motoristaId, setMotoristaId] = useState("__none");
  const [dataSaida, setDataSaida] = useState("");

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-provisao"],
    enabled: isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("veiculos")
        .select("id, placa, modelo, tipo, provisao_manutencao_km, provisao_pneus_km")
        .eq("ativo", true)
        .order("placa");
      return data ?? [];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-planejador"],
    enabled: isStaff,
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome");
      return data ?? [];
    },
  });

  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas-planejador"],
    enabled: isStaff,
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("id, nome").eq("ativo", true).order("nome");
      return data ?? [];
    },
  });

  const { data: historico = [] } = useQuery({
    queryKey: ["simulacoes-viagem"],
    enabled: isStaff,
    queryFn: async () => {
      const { data } = await supabase
        .from("simulacoes_viagem")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  useEffect(() => {
    const v = veiculos.find((x: any) => x.id === veiculoId) as any;
    if (!v) return;
    setManutKm(v.provisao_manutencao_km ? String(v.provisao_manutencao_km) : "");
    setPneusKm(v.provisao_pneus_km ? String(v.provisao_pneus_km) : "");
  }, [veiculoId, veiculos]);

  const pontos = useMemo(
    () => [origem, ...paradas, destino].map((p) => p.trim()).filter(Boolean),
    [origem, paradas, destino],
  );

  const calcular = useMutation({
    mutationFn: async () => {
      if (pontos.length < 2) throw new Error("Informe origem e destino.");
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/planejador-rota", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session?.access_token
            ? { Authorization: `Bearer ${data.session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ pontos, tipoRota, eixos, tipoVeiculo }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Falha ao calcular a rota");
      return (await res.json()) as Resultado;
    },
    onSuccess: (r) => {
      setResultado(r);
      setPedagioManual("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const km = resultado?.km ?? 0;
  const litros = num(consumo) > 0 && km > 0 ? km / num(consumo) : 0;
  const custoCombustivel = litros * num(precoDiesel);
  const pedagio = pedagioManual.trim() !== "" ? num(pedagioManual) : (resultado?.pedagioTotal ?? 0);
  const receita = num(frete);
  const comissao = (receita * num(comissaoPct)) / 100;

  const custos = {
    receita,
    combustivel: custoCombustivel,
    pedagio,
    comissao,
    provisaoManutencao: calcularProvisao(km || null, manutKm),
    provisaoPneus: calcularProvisao(km || null, pneusKm),
    outros: num(outros),
    km: km || null,
  };
  const custoTotal =
    custos.combustivel +
    custos.pedagio +
    custos.comissao +
    custos.provisaoManutencao +
    custos.provisaoPneus +
    custos.outros;
  const lucro = receita - custoTotal;

  const salvar = useMutation({
    mutationFn: async () => {
      if (!resultado) throw new Error("Calcule a rota antes de salvar.");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("simulacoes_viagem").insert({
        nome: `${origem} → ${destino}`,
        origem,
        destino,
        paradas,
        tipo_veiculo: tipoVeiculo,
        eixos,
        tipo_rota: tipoRota,
        consumo_km_l: num(consumo) || null,
        preco_combustivel: num(precoDiesel) || null,
        distancia_km: resultado.km,
        duracao_min: resultado.minutos,
        litros,
        custo_combustivel: custoCombustivel,
        custo_pedagios: pedagio,
        valor_frete: receita || null,
        comissao_percentual: num(comissaoPct) || null,
        comissao_valor: comissao,
        provisao_manutencao_km: num(manutKm) || null,
        provisao_pneus_km: num(pneusKm) || null,
        custo_total: custoTotal,
        lucro,
        margem: receita > 0 ? (lucro / receita) * 100 : null,
        polyline: resultado.polyline,
        veiculo_id: veiculoId === "__none" ? null : veiculoId,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Simulação salva no histórico.");
      queryClient.invalidateQueries({ queryKey: ["simulacoes-viagem"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("simulacoes_viagem").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["simulacoes-viagem"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const converter = useMutation({
    mutationFn: async () => {
      if (!resultado) throw new Error("Calcule a rota antes de converter.");
      const o = cidadeUf(origem);
      const d = cidadeUf(destino);
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("viagens")
        .insert({
          cliente_id: clienteId === "__none" ? null : clienteId,
          motorista_id: motoristaId === "__none" ? null : motoristaId,
          veiculo_id: veiculoId === "__none" ? null : veiculoId,
          origem_cidade: o.cidade,
          origem_uf: o.uf || null,
          destino_cidade: d.cidade,
          destino_uf: d.uf || null,
          data_prevista_saida: dataSaida || null,
          valor_frete: receita || null,
          status: "planejada" as const,
          created_by: userData.user?.id ?? null,
          observacoes: [
            `Planejada pelo Planejador Inteligente.`,
            `Distância: ${resultado.km.toFixed(0)} km · Tempo: ${formatarDuracao(resultado.minutos)}`,
            paradas.length ? `Paradas: ${paradas.join(" | ")}` : null,
            `Combustível: ${litros.toFixed(0)} L (${brl(custoCombustivel)}) · Pedágios (${eixos} eixos): ${brl(pedagio)}`,
            `Custo total estimado: ${brl(custoTotal)} · Lucro estimado: ${brl(lucro)}`,
          ]
            .filter(Boolean)
            .join("\n"),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      toast.success("Viagem criada com status planejada.");
      setConverterOpen(false);
      queryClient.invalidateQueries({ queryKey: ["viagens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isStaff) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-8 text-center text-sm text-muted-foreground">Acesso restrito.</Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <RouteIcon className="size-6 text-brand" />
        <div>
          <h1 className="font-display text-xl font-bold md:text-2xl">Planejador de viagens</h1>
          <p className="text-xs text-muted-foreground">
            Rota, distância, tempo, combustível e pedágios por eixo com resultado financeiro imediato.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">

          <Card className="space-y-4 p-4">
            <div className="space-y-2">
              <Label className="text-xs">Origem</Label>
              <LocalInput value={origem} onChange={setOrigem} placeholder="Cidade, endereço ou CEP" />
            </div>

            {paradas.map((p, i) => (
              <div key={i} className="space-y-2">
                <Label className="text-xs">Parada {i + 1}</Label>
                <div className="flex gap-2">
                  <LocalInput
                    className="flex-1"
                    value={p}
                    onChange={(v) => setParadas((atual) => atual.map((x, idx) => (idx === i ? v : x)))}
                    placeholder="Ponto intermediário"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover parada ${i + 1}`}
                    onClick={() => setParadas((atual) => atual.filter((_, idx) => idx !== i))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setParadas((atual) => [...atual, ""])}
            >
              <Plus className="mr-1 size-4" /> Adicionar parada
            </Button>

            <div className="space-y-2">
              <Label className="text-xs">Destino</Label>
              <LocalInput value={destino} onChange={setDestino} placeholder="Cidade, endereço ou CEP" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Tipo de veículo</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {VEICULOS.map((v) => {
                  const Icon = v.icon;
                  const ativo = tipoVeiculo === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      title={v.nome}
                      aria-pressed={ativo}
                      onClick={() => {
                        setTipoVeiculo(v.id);
                        setEixos(v.eixos);
                      }}
                      className={cn(
                        "flex min-w-0 flex-col items-center gap-1 rounded-lg border p-2 text-[10px] transition",
                        ativo
                          ? "border-brand bg-brand-subtle text-brand"
                          : "border-border text-muted-foreground hover:border-brand/50",
                      )}
                    >
                      <Icon className="size-5 shrink-0" />
                      <span className="w-full truncate text-center">{v.nome.split(" ")[0]}</span>

                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Eixos (define a tarifa do pedágio)</Label>
              <div className="flex flex-wrap gap-1.5">
                {[2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={eixos === n}
                    onClick={() => setEixos(n)}
                    className={cn(
                      "size-9 rounded-md border text-sm font-semibold transition",
                      eixos === n
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border text-muted-foreground hover:border-brand/50",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Tipo de rota">
                <Select value={tipoRota} onValueChange={(v) => setTipoRota(v as typeof tipoRota)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eficiente">Mais eficiente</SelectItem>
                    <SelectItem value="curta">Menor distância</SelectItem>
                    <SelectItem value="sem_pedagio">Evitar pedágios</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Veículo do ERP (provisões)">
                <Select value={veiculoId} onValueChange={setVeiculoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem veículo</SelectItem>
                    {veiculos.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.placa} · {v.modelo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Consumo médio (km/l)">
                <Input type="number" step="0.1" value={consumo} onChange={(e) => setConsumo(e.target.value)} />
              </Campo>
              <Campo label="Preço do combustível (R$/l)">
                <Input
                  type="number"
                  step="0.01"
                  value={precoDiesel}
                  onChange={(e) => setPrecoDiesel(e.target.value)}
                />
              </Campo>
            </div>

            <Button
              className="w-full"
              onClick={() => calcular.mutate()}
              disabled={calcular.isPending || pontos.length < 2}
            >
              {calcular.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MapPinned className="mr-2 size-4" />}
              Calcular rota
            </Button>
          </Card>

          <Card className="space-y-3 p-4">
            <p className="text-sm font-semibold">Dados financeiros da viagem</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Valor do frete (R$)">
                <Input type="number" step="0.01" value={frete} onChange={(e) => setFrete(e.target.value)} />
              </Campo>
              <Campo label="Comissão do motorista (%)">
                <Input
                  type="number"
                  step="0.1"
                  value={comissaoPct}
                  onChange={(e) => setComissaoPct(e.target.value)}
                />
              </Campo>
              <Campo label="Pedágios (R$) — ajuste manual">
                <Input
                  type="number"
                  step="0.01"
                  placeholder={resultado ? resultado.pedagioTotal.toFixed(2) : "Calculado pela rota"}
                  value={pedagioManual}
                  onChange={(e) => setPedagioManual(e.target.value)}
                />
              </Campo>
              <Campo label="Outros custos (R$)">
                <Input type="number" step="0.01" value={outros} onChange={(e) => setOutros(e.target.value)} />
              </Campo>
              <Campo label="Provisão manutenção (R$/km)">
                <Input type="number" step="0.01" value={manutKm} onChange={(e) => setManutKm(e.target.value)} />
              </Campo>
              <Campo label="Provisão pneus (R$/km)">
                <Input type="number" step="0.01" value={pneusKm} onChange={(e) => setPneusKm(e.target.value)} />
              </Campo>
            </div>
            <p className="text-xs text-muted-foreground">
              Provisionamentos vazios ou zerados não entram no cálculo.
            </p>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <MapaRota polyline={resultado?.polyline ?? ""} pontos={pontos} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Indicador icon={RouteIcon} label="Distância" valor={km ? `${km.toFixed(0)} km` : "—"} />
            <Indicador
              icon={Clock}
              label="Tempo estimado"
              valor={resultado ? formatarDuracao(resultado.minutos) : "—"}
            />
            <Indicador
              icon={Fuel}
              label="Combustível"
              valor={litros ? `${litros.toFixed(0)} L` : "—"}
              sub={litros ? brl(custoCombustivel) : undefined}
            />
            <Indicador
              icon={MapPinned}
              label={`Pedágios (${eixos} eixos)`}
              valor={resultado ? brl(pedagio) : "—"}
              sub="Estimativa"
            />
          </div>

          {resultado && resultado.trechos.length > 1 && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Trechos da rota</p>
              <div className="divide-y divide-border/60">
                {resultado.trechos.map((t) => (
                  <div key={t.indice} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {t.de} → {t.para}
                    </span>
                    <span className="font-mono tabular-nums">{t.km.toFixed(0)} km</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatarDuracao(t.minutos)}
                    </span>
                    <span className="font-mono tabular-nums">{brl(t.pedagio)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div>
            <h2 className="mb-2 font-display text-lg font-bold">Demonstrativo financeiro</h2>
            <DemonstrativoViagem custos={custos} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => salvar.mutate()} disabled={!resultado || salvar.isPending}>
              <Save className="mr-2 size-4" /> Salvar simulação
            </Button>
            <Button onClick={() => setConverterOpen(true)} disabled={!resultado}>
              <Truck className="mr-2 size-4" /> Converter em viagem
            </Button>
          </div>

          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">Histórico de simulações</p>
            {historico.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma simulação salva ainda.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {historico.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 py-2 text-sm">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setOrigem(s.origem);
                        setDestino(s.destino);
                        setParadas(Array.isArray(s.paradas) ? (s.paradas as string[]) : []);
                        setTipoVeiculo(s.tipo_veiculo);
                        setEixos(s.eixos);
                        setTipoRota(s.tipo_rota);
                        setConsumo(s.consumo_km_l ? String(s.consumo_km_l) : "");
                        setPrecoDiesel(s.preco_combustivel ? String(s.preco_combustivel) : "");
                        setFrete(s.valor_frete ? String(s.valor_frete) : "");
                        setComissaoPct(s.comissao_percentual ? String(s.comissao_percentual) : "0");
                        setManutKm(s.provisao_manutencao_km ? String(s.provisao_manutencao_km) : "");
                        setPneusKm(s.provisao_pneus_km ? String(s.provisao_pneus_km) : "");
                        setPedagioManual(s.custo_pedagios ? String(s.custo_pedagios) : "");
                        setResultado({
                          km: Number(s.distancia_km ?? 0),
                          minutos: Number(s.duracao_min ?? 0),
                          polyline: s.polyline ?? "",
                          pedagioTotal: Number(s.custo_pedagios ?? 0),
                          trechos: [],
                          fatorEixos: 1,
                        });
                      }}
                    >
                      <span className="block truncate font-medium">{s.nome ?? `${s.origem} → ${s.destino}`}</span>
                      <span className="text-xs text-muted-foreground">
                        {Number(s.distancia_km ?? 0).toFixed(0)} km · {brl(Number(s.lucro ?? 0))} de lucro
                      </span>
                    </button>
                    <Badge variant="outline">{s.eixos} eixos</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir simulação"
                      onClick={() => excluir.mutate(s.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={converterOpen} onOpenChange={setConverterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Converter em viagem</DialogTitle>
            <DialogDescription>
              Cria uma viagem planejada com a rota, o frete e os custos estimados nas observações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Campo label="Cliente">
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem cliente</SelectItem>
                  {clientes.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Motorista">
              <Select value={motoristaId} onValueChange={setMotoristaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem motorista</SelectItem>
                  {motoristas.map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Veículo">
              <Select value={veiculoId} onValueChange={setVeiculoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem veículo</SelectItem>
                  {veiculos.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>{v.placa} · {v.modelo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Saída prevista">
              <Input type="datetime-local" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} />
            </Campo>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConverterOpen(false)}>Cancelar</Button>
            <Button onClick={() => converter.mutate()} disabled={converter.isPending}>
              {converter.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Criar viagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Indicador({
  icon: Icon,
  label,
  valor,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valor: string;
  sub?: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className="size-4 text-brand" />
      </div>
      <div className="mt-1 font-display text-lg font-bold">{valor}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}
