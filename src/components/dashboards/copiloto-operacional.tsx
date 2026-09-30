import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Gauge, Route as RouteIcon, Truck, Wrench, Trophy, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useHideValues } from "@/hooks/use-hide-values";
import { supabase } from "@/integrations/supabase/client";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function CopilotoOperacional() {
  const { mask } = useHideValues();
  const { data } = useQuery({
    queryKey: ["copiloto-operacional"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 90 * 864e5).toISOString();
      const [viagens, mot, fin, vei, man, ab] = await Promise.all([
        supabase.from("viagens").select("id, codigo, status, motorista_id, veiculo_id, data_saida, data_prevista_saida, origem_cidade, destino_cidade").or(`status.in.(planejada,em_andamento),data_saida.gte.${desde}`),
        supabase.from("motoristas").select("id, nome, telefone").eq("ativo", true),
        supabase.from("financeiro_lancamentos").select("tipo, valor, status, data_vencimento").in("status", ["pendente", "atrasado"]).lte("data_vencimento", hojeSP()),
        supabase.from("veiculos").select("id, placa, odometro_atual").eq("ativo", true),
        supabase.from("manutencoes").select("veiculo_id, tipo, data, proxima_revisao_km, proxima_revisao_data").order("data", { ascending: false }),
        supabase.from("abastecimentos").select("motorista_id, veiculo_id, consumo_medio").gte("data", desde.slice(0, 10)).not("consumo_medio", "is", null),
      ]);
      return {
        viagens: viagens.data ?? [], motoristas: mot.data ?? [], fin: fin.data ?? [],
        veiculos: vei.data ?? [], manut: man.data ?? [], abast: ab.data ?? [],
      };
    },
  });

  const r = useMemo(() => {
    if (!data) return null;
    const hoje = hojeSP();
    const agora = Date.now();
    const nome = (id: string | null) => data.motoristas.find((m) => m.id === id);
    const placa = (id: string | null) => data.veiculos.find((v) => v.id === id)?.placa ?? "—";
    const emRota = data.viagens.filter((v) => v.status === "em_andamento");
    const naoIniciadas = data.viagens.filter(
      (v) => v.status === "planejada" && v.data_prevista_saida && new Date(v.data_prevista_saida).getTime() < agora,
    );
    const soma = (tipo: string, pred: (d: string) => boolean) =>
      data.fin.filter((f) => f.tipo === tipo && pred(String(f.data_vencimento))).reduce((a, f) => a + Number(f.valor ?? 0), 0);
    const receberHoje = soma("receber", (d) => d === hoje);
    const pagarHoje = soma("pagar", (d) => d === hoje);
    const vencido = soma("receber", (d) => d < hoje);

    // Manutenção preventiva: última previsão por veículo
    const limiteData = new Date(agora + 7 * 864e5).toISOString().slice(0, 10);
    const preventivas = data.veiculos.flatMap((v) => {
      const m = data.manut.find((x) => x.veiculo_id === v.id && (x.proxima_revisao_km || x.proxima_revisao_data));
      if (!m) return [];
      const faltaKm = m.proxima_revisao_km != null && v.odometro_atual != null ? Number(m.proxima_revisao_km) - Number(v.odometro_atual) : null;
      const porKm = faltaKm != null && faltaKm <= 500;
      const porData = !!m.proxima_revisao_data && m.proxima_revisao_data <= limiteData;
      return porKm || porData ? [{ placa: v.placa, tipo: m.tipo, faltaKm, data: m.proxima_revisao_data }] : [];
    });

    // Score: 50% pontualidade de saída (tolerância 30 min) + 50% consumo vs média da frota
    const consumoFrota = data.abast.length ? data.abast.reduce((a, x) => a + Number(x.consumo_medio), 0) / data.abast.length : 0;
    const scores = data.motoristas.map((m) => {
      const vs = data.viagens.filter((v) => v.motorista_id === m.id && v.data_saida && v.data_prevista_saida);
      const pont = vs.length
        ? vs.filter((v) => new Date(v.data_saida!).getTime() - new Date(v.data_prevista_saida!).getTime() <= 30 * 60e3).length / vs.length
        : null;
      const ab = data.abast.filter((a) => a.motorista_id === m.id);
      const media = ab.length ? ab.reduce((a, x) => a + Number(x.consumo_medio), 0) / ab.length : null;
      const cons = media != null && consumoFrota ? Math.min(1.2, media / consumoFrota) / 1.2 : null;
      const partes = [pont, cons].filter((x): x is number => x != null);
      if (!partes.length) return null;
      return { nome: m.nome, score: Math.round((partes.reduce((a, b) => a + b, 0) / partes.length) * 100), pont, media };
    }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.score - a.score);

    return { emRota, naoIniciadas, receberHoje, pagarHoje, vencido, preventivas, scores, consumoFrota, nome, placa };
  }, [data]);

  if (!r) return null;

  return (
    <Card className="border-brand/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display"><RouteIcon className="size-5 text-brand" /> Copiloto operacional</CardTitle>
        <CardDescription>Radar do dia: frota em rota, pendências, contas de hoje e manutenções próximas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Mini icon={Truck} label="Em viagem agora" value={String(r.emRota.length)} />
          <Mini icon={AlertTriangle} label="Planejadas sem iniciar" value={String(r.naoIniciadas.length)} danger={r.naoIniciadas.length > 0} />
          <Mini icon={CalendarClock} label="Receber hoje" value={mask(moeda(r.receberHoje))} to="/app/receber" search={{ atalho: "hoje" }} />
          <Mini icon={CalendarClock} label="Pagar hoje" value={mask(moeda(r.pagarHoje))} to="/app/pagar" search={{ atalho: "hoje" }} />
          <Mini icon={AlertTriangle} label="A receber vencido" value={mask(moeda(r.vencido))} danger={r.vencido > 0} to="/app/receber" search={{ atalho: "atrasados" }} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Bloco titulo="Motoristas em rota" vazio="Nenhum carro em viagem.">
            {r.emRota.map((v) => (
              <Linha key={v.id} to={v.id}>
                <span className="truncate">{r.nome(v.motorista_id)?.nome ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{r.placa(v.veiculo_id)} · {v.destino_cidade ?? ""}</span>
              </Linha>
            ))}
          </Bloco>
          <Bloco titulo="Saída prevista passou e não iniciou" vazio="Todas as saídas em dia.">
            {r.naoIniciadas.map((v) => {
              const m = r.nome(v.motorista_id);
              return (
                <Linha key={v.id} to={v.id}>
                  <span className="truncate">OS {v.codigo} · {m?.nome ?? "—"}</span>
                  {m?.telefone && (
                    <a href={`tel:${m.telefone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-brand">
                      <Phone className="size-3" /> {m.telefone}
                    </a>
                  )}
                </Linha>
              );
            })}
          </Bloco>
          <Bloco titulo="Manutenção preventiva (≤ 500 km ou 7 dias)" vazio="Nenhuma revisão próxima." icon={Wrench}>
            {r.preventivas.map((p, i) => (
              <li key={i} className="flex justify-between gap-2 text-sm">
                <span className="truncate">{p.placa} · {p.tipo}</span>
                <span className="text-xs text-muted-foreground">
                  {p.faltaKm != null ? `${p.faltaKm.toLocaleString("pt-BR")} km` : ""} {p.data ? new Date(`${p.data}T12:00`).toLocaleDateString("pt-BR") : ""}
                </span>
              </li>
            ))}
          </Bloco>
        </div>

        <Bloco titulo={`Score dos motoristas (90 dias) · média da frota ${r.consumoFrota.toFixed(2)} km/L`} vazio="Sem dados suficientes." icon={Trophy}>
          {r.scores.slice(0, 10).map((s) => (
            <li key={s.nome} className="flex items-center gap-2 text-sm">
              <Badge variant={s.score >= 80 ? "default" : s.score >= 60 ? "secondary" : "destructive"} className="w-12 justify-center">{s.score}</Badge>
              <span className="flex-1 truncate">{s.nome}</span>
              <span className="text-xs text-muted-foreground">
                {s.pont != null ? `pontualidade ${Math.round(s.pont * 100)}%` : ""}
                {s.media != null ? ` · ${s.media.toFixed(2)} km/L` : ""}
              </span>
              {s.media != null && r.consumoFrota > 0 && (
                <Gauge className={`size-3.5 ${s.media >= r.consumoFrota ? "text-brand" : "text-destructive"}`} />
              )}
            </li>
          ))}
        </Bloco>
      </CardContent>
    </Card>
  );
}

function Mini({ icon: Icon, label, value, danger, to, search }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; danger?: boolean; to?: "/app/receber" | "/app/pagar"; search?: { atalho: "hoje" | "atrasados" } | null }) {
  const corpo = (
    <>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        {label} <Icon className={`size-3.5 ${danger ? "text-destructive" : "text-brand"}`} />
      </div>
      <div className={`mt-1 font-display text-lg font-bold ${danger ? "text-destructive" : ""}`}>{value}</div>
    </>
  );
  if (to) {
    return (
      <Link to={to} search={search} className="block rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted">
        {corpo}
      </Link>
    );
  }
  return <div className="rounded-lg border border-border/60 p-3">{corpo}</div>;
}

function Bloco({ titulo, vazio, children, icon: Icon }: { titulo: string; vazio: string; children: React.ReactNode[]; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {Icon && <Icon className="size-3.5 text-brand" />} {titulo}
      </p>
      {children.length ? <ul className="max-h-56 space-y-1.5 overflow-y-auto">{children}</ul> : <p className="text-sm text-muted-foreground">{vazio}</p>}
    </div>
  );
}

function Linha({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link to="/app/viagens/$id" params={{ id: to }} className="flex flex-col rounded px-1 text-sm hover:bg-muted">
        {children}
      </Link>
    </li>
  );
}
