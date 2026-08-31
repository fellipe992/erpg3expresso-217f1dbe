import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, Loader2, Truck, Wrench, User, Route as RouteIcon } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/crud/page-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_authenticated/app/frota")({
  head: () => ({
    meta: [
      { title: "Frota por veículo — G3 Expresso" },
      { name: "description", content: "Odômetro, quilometragem rodada, motoristas e manutenções de cada veículo da frota G3 Expresso." },
      { property: "og:title", content: "Frota por veículo — G3 Expresso" },
      { property: "og:description", content: "Acompanhe odômetro, km rodados e manutenções de cada carro sem abrir a tela de viagens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FrotaPage,
});

const numBR = (v: number | string | null | undefined, dec = 0) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const moedaBR = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (v: string | null | undefined) =>
  v ? new Date(v.length <= 10 ? `${v}T12:00:00` : v).toLocaleDateString("pt-BR") : "—";

function FrotaPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["frota-resumo"],
    queryFn: async () => {
      const [veiculos, motoristas, viagens, manutencoes] = await Promise.all([
        supabase
          .from("veiculos")
          .select("id, placa, modelo, marca, tipo, ativo, agregado, proprietario_nome, odometro_atual, odometro_atualizado_em, provisao_manutencao_km")
          .order("placa"),
        supabase.from("motoristas").select("id, nome, telefone, veiculo_id, ativo").eq("ativo", true),
        supabase.from("viagens").select("id, codigo, veiculo_id, status, km_inicial, km_final, data_chegada, data_saida"),
        supabase
          .from("manutencoes")
          .select("id, veiculo_id, data, tipo, oficina, valor, km_atual, proxima_revisao_data, proxima_revisao_km")
          .order("data", { ascending: false }),
      ]);
      if (veiculos.error) throw veiculos.error;
      if (motoristas.error) throw motoristas.error;
      if (viagens.error) throw viagens.error;
      if (manutencoes.error) throw manutencoes.error;
      return {
        veiculos: veiculos.data ?? [],
        motoristas: motoristas.data ?? [],
        viagens: viagens.data ?? [],
        manutencoes: manutencoes.data ?? [],
      };
    },
  });

  const linhas = useMemo(() => {
    if (!data) return [];
    const hoje = new Date();
    const inicio30 = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);

    return data.veiculos.map((v) => {
      const motoristas = data.motoristas.filter((m) => m.veiculo_id === v.id);
      const viagens = data.viagens.filter((x) => x.veiculo_id === v.id);
      const concluidas = viagens.filter((x) => x.status === "concluida" && x.km_inicial != null && x.km_final != null);
      const kmTotal = concluidas.reduce((acc, x) => {
        const d = Number(x.km_final) - Number(x.km_inicial);
        return acc + (d > 0 ? d : 0);
      }, 0);
      const km30 = concluidas
        .filter((x) => x.data_chegada && new Date(x.data_chegada) >= inicio30)
        .reduce((acc, x) => {
          const d = Number(x.km_final) - Number(x.km_inicial);
          return acc + (d > 0 ? d : 0);
        }, 0);
      const mediaViagem = concluidas.length ? Math.round(kmTotal / concluidas.length) : null;
      const manuts = data.manutencoes.filter((m) => m.veiculo_id === v.id);
      const custoManut = manuts.reduce((acc, m) => acc + Number(m.valor ?? 0), 0);
      const emAndamento = viagens.find((x) => x.status === "em_andamento") ?? null;
      const odometro = v.odometro_atual != null ? Number(v.odometro_atual) : null;
      const proximaRevisao = manuts.find((m) => m.proxima_revisao_data || m.proxima_revisao_km) ?? null;

      return {
        veiculo: v,
        motoristas,
        kmTotal,
        km30,
        mediaViagem,
        viagensConcluidas: concluidas.length,
        manuts,
        custoManut,
        emAndamento,
        odometro,
        proximaRevisao,
      };
    });
  }, [data]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter((l) =>
      [l.veiculo.placa, l.veiculo.modelo, l.veiculo.marca, ...l.motoristas.map((m) => m.nome)]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(q)),
    );
  }, [linhas, search]);

  return (
    <PageShell
      icon={Truck}
      title="Frota por veículo"
      subtitle="Odômetro, km rodados, motoristas e manutenções de cada carro"
      search={search}
      onSearch={setSearch}
      onAdd={() => {}}
      canAdd={false}
    >
      {isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : filtradas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum veículo encontrado.</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtradas.map((l) => (
            <Card key={l.veiculo.id} className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 bg-brand-subtle/40 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg font-bold">{l.veiculo.placa}</span>
                    <Badge variant="outline" className="uppercase">{l.veiculo.tipo}</Badge>
                    {l.veiculo.agregado && <Badge variant="secondary">Agregado</Badge>}
                    {!l.veiculo.ativo && <Badge variant="destructive">Inativo</Badge>}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {[l.veiculo.marca, l.veiculo.modelo].filter(Boolean).join(" ")}
                    {l.veiculo.agregado && l.veiculo.proprietario_nome ? ` · ${l.veiculo.proprietario_nome}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 font-display text-xl font-bold text-brand">
                    <Gauge className="size-4" />
                    {numBR(l.odometro)}
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    odômetro {l.veiculo.odometro_atualizado_em ? `· ${dataBR(l.veiculo.odometro_atualizado_em)}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
                <Metric label="Km rodados" value={`${numBR(l.kmTotal)} km`} />
                <Metric label="Últimos 30 dias" value={`${numBR(l.km30)} km`} />
                <Metric label="Média/viagem" value={l.mediaViagem != null ? `${numBR(l.mediaViagem)} km` : "—"} />
                <Metric label="Viagens concluídas" value={numBR(l.viagensConcluidas)} />
              </div>

              <Separator />

              <div className="space-y-3 p-4 text-sm">
                <div>
                  <Label>Motorista(s) vinculado(s)</Label>
                  {l.motoristas.length === 0 ? (
                    <p className="text-muted-foreground">Sem motorista vinculado</p>
                  ) : (
                    <ul className="space-y-1">
                      {l.motoristas.map((m) => (
                        <li key={m.id} className="flex items-center gap-2">
                          <User className="size-3.5 text-brand" />
                          <span className="truncate">{m.nome}</span>
                          {m.telefone && <span className="text-xs text-muted-foreground">{m.telefone}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {l.emAndamento && (
                  <div className="flex items-center gap-2 rounded-md bg-brand-subtle/50 px-3 py-2">
                    <RouteIcon className="size-4 text-brand" />
                    <span className="text-xs">
                      Viagem em andamento {l.emAndamento.codigo ? `· OS #${l.emAndamento.codigo}` : ""}
                    </span>
                    <Button asChild size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs">
                      <Link to="/app/viagens/$id" params={{ id: l.emAndamento.id }}>Abrir</Link>
                    </Button>
                  </div>
                )}

                <div>
                  <Label>Manutenções</Label>
                  <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{numBR(l.manuts.length)} registro(s)</span>
                    <span>Total {moedaBR(l.custoManut)}</span>
                    {l.proximaRevisao && (
                      <span>
                        Próxima revisão:{" "}
                        {l.proximaRevisao.proxima_revisao_data
                          ? dataBR(l.proximaRevisao.proxima_revisao_data)
                          : `${numBR(l.proximaRevisao.proxima_revisao_km)} km`}
                      </span>
                    )}
                  </div>
                  {l.manuts.length === 0 ? (
                    <p className="text-muted-foreground">Nenhuma manutenção registrada</p>
                  ) : (
                    <ul className="space-y-1">
                      {l.manuts.slice(0, 4).map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center gap-2">
                          <Wrench className="size-3.5 text-brand" />
                          <span className="truncate">{m.tipo}</span>
                          <span className="text-xs text-muted-foreground">{dataBR(m.data)}</span>
                          {m.km_atual != null && (
                            <span className="text-xs text-muted-foreground">{numBR(m.km_atual)} km</span>
                          )}
                          <span className="ml-auto text-xs font-medium">{moedaBR(Number(m.valor ?? 0))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/manutencoes">Manutenções</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/abastecimentos">Abastecimentos</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/veiculos">Editar veículo</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">{children}</p>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 p-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-display text-base font-bold">{value}</p>
    </div>
  );
}
