import { createFileRoute, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Play,
  CheckCircle2,
  Loader2,
  ClipboardCheck,
  AlertTriangle,
  Camera,
  Fuel,
  DollarSign,
  FileText,
  History,
  Plus,
  Receipt,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { RotaViagemButton } from "@/components/viagem/rota-viagem-dialog";
import { NavegacaoButton } from "@/components/viagem/navegacao-dialog";
import { ParadasRotaCard } from "@/components/viagem/paradas-rota";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UploadFotos } from "@/components/viagem/upload-fotos";
import { DemonstrativoViagem, calcularProvisao, brl } from "@/components/viagem/demonstrativo-viagem";

export const Route = createFileRoute("/_authenticated/app/viagens/$id")({
  head: () => ({ meta: [{ title: "Viagem — G3 Expresso" }] }),
  component: ViagemDetalheePage,
});

const STATUS_META = {
  planejada: { label: "Planejada", variant: "outline" as const },
  em_andamento: { label: "Em andamento", variant: "default" as const },
  concluida: { label: "Concluída", variant: "secondary" as const },
  cancelada: { label: "Cancelada", variant: "destructive" as const },
};

function ViagemDetalheePage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const canWrite = role === "administrador" || role === "gestor" || role === "financeiro";
  const isStaff = canWrite;


  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["viagem", id] });
    qc.invalidateQueries({ queryKey: ["checklists", id] });
    qc.invalidateQueries({ queryKey: ["viagem-anexos", id] });
    qc.invalidateQueries({ queryKey: ["viagem-ocorrencias", id] });
    qc.invalidateQueries({ queryKey: ["viagem-auditoria", id] });
    qc.invalidateQueries({ queryKey: ["viagem-financeiro", id] });
    qc.invalidateQueries({ queryKey: ["viagens"] });
    qc.invalidateQueries({ queryKey: ["financeiro"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    qc.invalidateQueries({ queryKey: ["motorista-dashboard"] });
  };

  const { data: viagem, isLoading } = useQuery({
    queryKey: ["viagem", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select("*, cliente:clientes(razao_social, cidade, uf), motorista:motoristas(nome, telefone), veiculo:veiculos(placa, modelo, marca, provisao_manutencao_km, provisao_pneus_km)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ["checklists", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("checklists").select("*").eq("viagem_id", id).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ocorrencias = [] } = useQuery({
    queryKey: ["viagem-ocorrencias", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagem_ocorrencias")
        .select("*")
        .eq("viagem_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: anexos = [] } = useQuery({
    queryKey: ["viagem-anexos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagem_anexos")
        .select("*")
        .eq("viagem_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: auditoria = [] } = useQuery({
    queryKey: ["viagem-auditoria", id],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagem_auditoria")
        .select("*")
        .eq("viagem_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: movimentacoes = [] } = useQuery({
    queryKey: ["viagem-financeiro", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financeiro_lancamentos")
        .select("id, tipo, descricao, categoria, centro_custo, valor, data_emissao, data_vencimento, status, origem")
        .eq("viagem_id", id)
        .order("data_emissao", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }
  if (!viagem) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="p-8 text-center text-sm text-muted-foreground">Viagem não encontrada.</Card>
      </div>
    );
  }

  const hasSaida = checklists.some((c) => c.tipo === "saida");
  const hasChegada = checklists.some((c) => c.tipo === "chegada");
  const kmRodado = viagem.km_inicial && viagem.km_final ? Number(viagem.km_final) - Number(viagem.km_inicial) : null;
  const podeEditarAnexos = isStaff || (viagem.status === "planejada" || viagem.status === "em_andamento");

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/viagens" })} className="-ml-2">
        <ArrowLeft className="mr-1 size-4" /> Voltar
      </Button>

      {/* Informações gerais */}
      <Card className="overflow-hidden">
        <div className="border-b border-border/60 bg-brand-subtle/40 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant={STATUS_META[viagem.status as keyof typeof STATUS_META].variant}>
                  {STATUS_META[viagem.status as keyof typeof STATUS_META].label}
                </Badge>
                {viagem.codigo && <span className="font-mono text-xs text-muted-foreground">OS #{viagem.codigo}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 font-display text-xl font-bold md:text-2xl">
                <MapPin className="size-5 text-brand" />
                <span>{viagem.origem_cidade ?? "—"}{viagem.origem_uf ? `/${viagem.origem_uf}` : ""}</span>
                <ArrowRight className="size-4 text-brand" />
                <span>{viagem.destino_cidade ?? "—"}{viagem.destino_uf ? `/${viagem.destino_uf}` : ""}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-4 text-sm md:grid-cols-2 md:p-6">
          <Info label="Cliente" value={viagem.cliente?.razao_social ?? "—"} />
          <Info label="Motorista" value={viagem.motorista?.nome ?? "—"} />
          <Info label="Veículo" value={viagem.veiculo ? `${viagem.veiculo.placa} — ${viagem.veiculo.modelo}` : "—"} />
          {isStaff && (
            <Info
              label="Valor do frete"
              value={viagem.valor_frete ? Number(viagem.valor_frete).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
            />
          )}
          <Info label="Saída prevista" value={viagem.data_prevista_saida ? new Date(viagem.data_prevista_saida).toLocaleString("pt-BR") : "—"} />
          <Info label="Chegada prevista" value={viagem.data_prevista_chegada ? new Date(viagem.data_prevista_chegada).toLocaleString("pt-BR") : "—"} />
          <Info label="Saída real" value={viagem.data_saida ? new Date(viagem.data_saida).toLocaleString("pt-BR") : "—"} />
          <Info label="Chegada real" value={viagem.data_chegada ? new Date(viagem.data_chegada).toLocaleString("pt-BR") : "—"} />
          <Info label="Km inicial" value={viagem.km_inicial ? `${numBR(viagem.km_inicial)} km` : "—"} />
          <Info label="Km final" value={viagem.km_final ? `${numBR(viagem.km_final)} km` : "—"} />
          {kmRodado !== null && (
            <Info label="Km rodado" value={<span className="font-semibold text-brand">{numBR(kmRodado)} km</span>} />
          )}
          {isStaff && (
            <div className="md:col-span-2">
              <EditarKmDialog
                viagemId={id}
                kmInicial={viagem.km_inicial}
                kmFinal={viagem.km_final}
                onDone={invalidateAll}
              />
            </div>
          )}
        </div>

        {(() => {
          // Motoristas não podem ver valores financeiros nas observações.
          const limpar = (t: string | null) => {
            if (!t) return "";
            const linhas = isStaff
              ? t.split("\n")
              : t
                  .split("\n")
                  .map((l) =>
                    l
                      .split(/\s·\s/)
                      .filter((p) => !/R\$|custo|lucro|receita|frete|margem/i.test(p))
                      .join(" · "),
                  )
                  .filter((l) => l.trim().length > 0);
            return linhas.join("\n").trim();
          };
          const obs = limpar(viagem.observacoes);
          const obsFinais = limpar(viagem.observacoes_finais);
          return (
            <>
              {obs && (
                <>
                  <Separator />
                  <div className="p-4 md:p-6">
                    <Label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Observações</Label>
                    <p className="whitespace-pre-wrap text-sm">{obs}</p>
                  </div>
                </>
              )}
              {obsFinais && (
                <>
                  <Separator />
                  <div className="p-4 md:p-6">
                    <Label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Observações finais</Label>
                    <p className="whitespace-pre-wrap text-sm">{obsFinais}</p>
                  </div>
                </>
              )}
            </>
          );
        })()}
      </Card>

      {(viagem.status === "planejada" || viagem.status === "em_andamento") && (
        <ParadasRotaCard viagemId={id} />
      )}

      {/* Ação: Iniciar viagem */}
      {viagem.status === "planejada" && (
        <ChecklistSaidaDialog
          viagemId={id}
          kmSugerido={viagem.km_inicial ?? null}
          onDone={invalidateAll}
          autoOpen={location.hash === "iniciar"}
        />
      )}

      {/* Durante a viagem */}
      {viagem.status === "em_andamento" && (
        <Card className="p-4">
          <h2 className="mb-3 font-display text-lg font-bold">Durante a viagem</h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <OcorrenciaDialog viagemId={id} motoristaId={viagem.motorista_id} onDone={invalidateAll} />
            <QuickPhotoUpload viagemId={id} onDone={invalidateAll} />
            {isStaff && (
              <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
                <Link to="/app/financeiro">
                  <DollarSign className="size-4" />
                  <span className="text-xs">Lançar despesa</span>
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
              <Link to="/app/abastecimentos">
                <Fuel className="size-4" />
                <span className="text-xs">Abastecimento</span>
              </Link>
            </Button>

          </div>
          <Separator className="my-4" />
          <div className="mb-3">
            <NavegacaoButton
              viagemId={id}
              destinoCidade={viagem.destino_cidade}
              destinoUf={viagem.destino_uf}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FinalizarViagemDialog
              viagemId={id}
              kmInicial={viagem.km_inicial ? Number(viagem.km_inicial) : null}
              onDone={invalidateAll}
              autoOpen={location.hash === "finalizar"}
            />
            <RotaViagemButton viagemId={id} />
          </div>
        </Card>
      )}

      {/* Rota (viagens concluídas) */}
      {viagem.status === "concluida" && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">Trajeto percorrido</h2>
              <p className="text-xs text-muted-foreground">Histórico de GPS registrado durante a viagem.</p>
            </div>
            <RotaViagemButton viagemId={id} />
          </div>
        </Card>
      )}


      {/* Checklists */}
      {checklists.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold">Checklists</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {checklists.map((c) => <ChecklistCard key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {/* Ocorrências */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Ocorrências</h2>
          {viagem.status === "em_andamento" && (
            <OcorrenciaDialog viagemId={id} motoristaId={viagem.motorista_id} onDone={invalidateAll} compact />
          )}
        </div>
        {ocorrencias.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma ocorrência registrada.</Card>
        ) : (
          <div className="space-y-2">
            {ocorrencias.map((o: any) => <OcorrenciaCard key={o.id} o={o} anexos={anexos.filter((a: any) => a.ocorrencia_id === o.id)} canDelete={podeEditarAnexos} onDeleted={invalidateAll} />)}
          </div>
        )}
      </div>

      {/* Anexos gerais */}
      {anexos.filter((a: any) => !a.ocorrencia_id).length > 0 && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold">Anexos da viagem</h2>
          <AnexosGrid anexos={anexos.filter((a: any) => !a.ocorrencia_id)} canDelete={podeEditarAnexos} onDeleted={invalidateAll} />
        </div>
      )}

      {/* Provisionamentos e demonstrativo (staff only) */}
      {isStaff && (
        <ProvisionamentosSection
          viagemId={id}

          km={kmRodado ?? (viagem.distancia_estimada_km ? Number(viagem.distancia_estimada_km) : null)}
          kmEstimado={!kmRodado && !!viagem.distancia_estimada_km}
          receita={Number(viagem.valor_frete ?? 0)}
          movimentacoes={movimentacoes}
          comissaoPctSalvo={viagem.comissao_percentual != null ? Number(viagem.comissao_percentual) : null}
          pedagioEstimado={viagem.pedagio_estimado != null ? Number(viagem.pedagio_estimado) : null}
          outrosEstimados={viagem.outros_custos_estimados != null ? Number(viagem.outros_custos_estimados) : null}
          manutencaoSalva={
            viagem.provisao_manutencao_km != null
              ? Number(viagem.provisao_manutencao_km)
              : ((viagem.veiculo as any)?.provisao_manutencao_km ?? null)
          }
          pneusSalvo={
            viagem.provisao_pneus_km != null
              ? Number(viagem.provisao_pneus_km)
              : ((viagem.veiculo as any)?.provisao_pneus_km ?? null)
          }
          onSaved={invalidateAll}
        />
      )}


      {/* Movimentações financeiras (staff only) */}

      {isStaff && (
        <div className="space-y-3">
          <h2 className="font-display text-lg font-bold">Movimentações financeiras</h2>
          {movimentacoes.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma movimentação vinculada.</Card>
          ) : (
            <Card className="divide-y divide-border/60">
              {movimentacoes.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={m.tipo === "receber" ? "default" : "secondary"} className="capitalize">
                        {m.origem ?? m.tipo}
                      </Badge>
                      <span className="truncate font-medium">{m.descricao}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {m.centro_custo ?? m.categoria ?? "—"} · {m.data_emissao ? new Date(m.data_emissao + "T00:00:00").toLocaleDateString("pt-BR") : "—"} · {m.status}
                    </div>
                  </div>
                  <div className={`font-mono font-semibold ${m.tipo === "receber" ? "text-brand" : "text-destructive"}`}>
                    {m.tipo === "receber" ? "+" : "-"} {Number(m.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {/* Auditoria (staff) */}
      {isStaff && auditoria.length > 0 && (
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold"><History className="size-4" /> Auditoria</h2>
          <Card className="divide-y divide-border/60">
            {auditoria.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 p-3 text-xs">
                <Badge variant="outline" className="capitalize">{String(a.evento).replace("_", " ")}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</div>
                  {a.detalhes && Object.keys(a.detalhes).length > 0 && (
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(a.detalhes, null, 2)}</pre>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {canWrite && (
        <div className="pt-4">
          <Button asChild variant="outline"><Link to="/app/viagens">Voltar à lista</Link></Button>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function ChecklistCard({ c }: { c: any }) {
  const itens = (c.itens ?? {}) as Record<string, boolean>;
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-brand" />
          <span className="font-semibold capitalize">{c.tipo === "saida" ? "Saída" : "Chegada"}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(c.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs">
        {c.pneus_ok != null && <ItemCheck label="Pneus" ok={c.pneus_ok} />}
        {c.oleo_ok != null && <ItemCheck label="Óleo" ok={c.oleo_ok} />}
        {c.agua_radiador_ok != null && <ItemCheck label="Água radiador" ok={c.agua_radiador_ok} />}
        {c.freios_ok != null && <ItemCheck label="Freios" ok={c.freios_ok} />}
        {c.tacografo_ok != null && <ItemCheck label="Tacógrafo" ok={c.tacografo_ok} />}
        {Object.entries(itens).map(([k, v]) => <ItemCheck key={k} label={k} ok={v} />)}
      </div>
      {c.km != null && <div className="mt-2 text-xs text-muted-foreground">Km: {c.km}</div>}
      {c.observacoes && <p className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{c.observacoes}</p>}
    </Card>
  );
}

function ItemCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <CheckCircle2 className={ok ? "size-3.5 text-brand" : "size-3.5 text-muted-foreground/40"} />
      <span className={ok ? "" : "text-muted-foreground line-through"}>{label}</span>
    </div>
  );
}

function OcorrenciaCard({ o, anexos, canDelete, onDeleted }: { o: any; anexos: any[]; canDelete?: boolean; onDeleted?: () => void }) {
  return (
    <Card className="p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-brand" />
          <span className="text-sm font-semibold">{o.local ?? "Ocorrência"}</span>
        </div>
        <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm">{o.descricao}</p>
      {o.observacoes && <p className="mt-1 text-xs text-muted-foreground">{o.observacoes}</p>}
      {anexos.length > 0 && <AnexosGrid anexos={anexos} className="mt-2" canDelete={canDelete} onDeleted={onDeleted} />}
    </Card>
  );
}

function AnexosGrid({ anexos, className, canDelete, onDeleted }: { anexos: any[]; className?: string; canDelete?: boolean; onDeleted?: () => void }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async (path: string) => {
    if (urls[path]) return;
    const { data } = await supabase.storage.from("viagem-fotos").createSignedUrl(path, 3600);
    if (data?.signedUrl) setUrls((u) => ({ ...u, [path]: data.signedUrl }));
  };

  const handleDelete = async (a: any) => {
    setDeletingId(a.id);
    try {
      const { error: sErr } = await supabase.storage.from("viagem-fotos").remove([a.storage_path]);
      if (sErr && !/not found/i.test(sErr.message)) throw sErr;
      const { error } = await supabase.from("viagem_anexos").delete().eq("id", a.id);
      if (error) throw error;
      toast.success("Foto removida");
      onDeleted?.();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao remover");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  return (
    <>
      <div className={`grid grid-cols-3 gap-2 md:grid-cols-6 ${className ?? ""}`}>
        {anexos.map((a) => {
          void load(a.storage_path);
          const isImg = (a.mime_type ?? "").startsWith("image/");
          return (
            <div key={a.id} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
              <a
                href={urls[a.storage_path] ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full w-full"
              >
                {isImg && urls[a.storage_path] ? (
                  <img src={urls[a.storage_path]} alt={a.categoria} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-muted-foreground">
                    <FileText className="size-6" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-[9px] uppercase text-white">
                  {a.categoria.replace("_", " ")}
                </div>
              </a>
              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmId(a.id); }}
                  disabled={deletingId === a.id}
                  className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-destructive/90 text-white opacity-0 shadow transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                  aria-label="Remover foto"
                >
                  {deletingId === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-xs leading-none">×</span>}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta foto?</AlertDialogTitle>
            <AlertDialogDescription>A imagem será excluída da viagem e não poderá ser recuperada.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const a = anexos.find((x) => x.id === confirmId);
                if (a) void handleDelete(a);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ============ Checklist de Saída ============
function ChecklistSaidaDialog({ viagemId, kmSugerido, onDone, autoOpen }: { viagemId: string; kmSugerido: number | null; onDone: () => void; autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const openedOnce = useRef(false);
  useEffect(() => {
    if (autoOpen && !openedOnce.current) {
      openedOnce.current = true;
      setConfirmOpen(true);
    }
  }, [autoOpen]);
  const [pneus, setPneus] = useState<boolean | null>(null);
  const [pneusFotos, setPneusFotos] = useState<{ path: string; mime: string; name: string }[]>([]);
  const [oleo, setOleo] = useState<"ok" | "verificar" | null>(null);
  const [agua, setAgua] = useState<"ok" | "completar" | null>(null);
  const [freios, setFreios] = useState<"ok" | "manutencao" | null>(null);
  const [tacografo, setTacografo] = useState<"ok" | "problema" | null>(null);

  const [obs, setObs] = useState("");
  const [km, setKm] = useState<string>(kmSugerido?.toString() ?? "");
  const [salvando, setSalvando] = useState(false);

  const canSubmit =
    pneus !== null &&
    oleo !== null &&
    agua !== null &&
    freios !== null &&
    tacografo !== null &&
    !!km;

  const submit = async () => {
    setSalvando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error: cErr } = await supabase.from("checklists").insert({
        viagem_id: viagemId,
        tipo: "saida",
        km: km ? Number(km) : null,
        pneus_ok: pneus,
        oleo_ok: oleo === "ok",
        agua_radiador_ok: agua === "ok",
        freios_ok: freios === "ok",
        tacografo_ok: tacografo === "ok",
        itens: {},
        observacoes: obs || null,
        created_by: userData.user?.id,
      });
      if (cErr) throw cErr;

      const { error: vErr } = await supabase
        .from("viagens")
        .update({
          status: "em_andamento",
          data_saida: new Date().toISOString(),
          km_inicial: km ? Number(km) : null,
          iniciada_por: userData.user?.id,
        })
        .eq("id", viagemId);
      if (vErr) throw vErr;

      toast.success("Viagem iniciada!");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error("Erro", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Button onClick={() => setConfirmOpen(true)} className="w-full bg-brand py-6 text-base hover:bg-brand/90 md:w-auto">
        <Play className="mr-2 size-5" /> Iniciar Viagem
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar esta viagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Você vai abrir o checklist de saída. Confirme apenas se estiver pronto para iniciar a viagem agora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-brand text-white hover:bg-brand/90"
              onClick={() => {
                setConfirmOpen(false);
                setOpen(true);
              }}
            >
              Sim, iniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Checklist de Saída</DialogTitle>
            <DialogDescription>Preencha todos os itens antes de iniciar a viagem.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Pneus */}
            <section className="space-y-2 rounded-lg border border-border/60 p-3">
              <Label className="font-semibold">Pneus</Label>
              <RadioGroup value={pneus === null ? "" : pneus ? "sim" : "nao"} onValueChange={(v) => setPneus(v === "sim")}>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="sim" /> Em boas condições
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="nao" /> Apresenta problema
                </label>
              </RadioGroup>
              <UploadFotos
                viagemId={viagemId}
                categoria="checklist_saida"
                label="Foto dos pneus (opcional)"
                onChange={setPneusFotos}
              />
            </section>

            {/* Óleo */}
            <RadioSection
              label="Nível do óleo"
              value={oleo}
              onChange={(v) => setOleo(v as any)}
              options={[["ok", "OK"], ["verificar", "Necessita verificação"]]}
            />

            {/* Água radiador */}
            <RadioSection
              label="Água do radiador"
              value={agua}
              onChange={(v) => setAgua(v as any)}
              options={[["ok", "OK"], ["completar", "Necessita completar"]]}
            />

            {/* Freios */}
            <RadioSection
              label="Freios"
              value={freios}
              onChange={(v) => setFreios(v as any)}
              options={[["ok", "OK"], ["manutencao", "Necessita manutenção"]]}
            />

            {/* Tacógrafo */}
            <RadioSection
              label="Tacógrafo"
              value={tacografo}
              onChange={(v) => setTacografo(v as any)}
              options={[["ok", "Funcionando"], ["problema", "Apresenta problema"]]}
            />

            <div className="space-y-1.5">
              <Label>Km inicial do veículo</Label>
              <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Estado geral / observações</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações do veículo..." />
            </div>

            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <Label className="font-semibold">Fotos do veículo</Label>
              <p className="text-xs text-muted-foreground">Frente, traseira, laterais, painel, carga.</p>
              <UploadFotos viagemId={viagemId} categoria="veiculo" label="Adicionar fotos" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={!canSubmit || salvando} className="bg-brand hover:bg-brand/90">
              {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Iniciar Viagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RadioSection({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <section className="space-y-2 rounded-lg border border-border/60 p-3">
      <Label className="font-semibold">{label}</Label>
      <RadioGroup value={value ?? ""} onValueChange={onChange}>
        {options.map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <RadioGroupItem value={k} /> {l}
          </label>
        ))}
      </RadioGroup>
    </section>
  );
}

// ============ Ocorrência ============
function OcorrenciaDialog({ viagemId, motoristaId, onDone, compact }: { viagemId: string; motoristaId: string | null; onDone: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState("");
  const [descricao, setDescricao] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ocorrenciaId, setOcorrenciaId] = useState<string | null>(null);

  const submit = async () => {
    if (!descricao.trim()) {
      toast.error("Descreva a ocorrência");
      return;
    }
    setSalvando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("viagem_ocorrencias")
        .insert({
          viagem_id: viagemId,
          motorista_id: motoristaId,
          local: local.trim() || null,
          descricao: descricao.trim(),
          observacoes: obs.trim() || null,
          created_by: userData.user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      setOcorrenciaId(data.id);
      toast.success("Ocorrência registrada");
      onDone();
    } catch (e) {
      toast.error("Erro", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  const close = () => {
    setOpen(false);
    setLocal("");
    setDescricao("");
    setObs("");
    setOcorrenciaId(null);
  };

  return (
    <>
      {compact ? (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-4" /> Ocorrência
        </Button>
      ) : (
        <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setOpen(true)}>
          <AlertTriangle className="size-4" />
          <span className="text-xs">Ocorrência</span>
        </Button>
      )}
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar ocorrência</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Local</Label>
              <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Cidade/UF, km da rodovia..." disabled={!!ocorrenciaId} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!!ocorrenciaId} />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} disabled={!!ocorrenciaId} />
            </div>
            {ocorrenciaId && (
              <UploadFotos viagemId={viagemId} categoria="ocorrencia" ocorrenciaId={ocorrenciaId} label="Fotos da ocorrência" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close}>{ocorrenciaId ? "Concluir" : "Cancelar"}</Button>
            {!ocorrenciaId && (
              <Button onClick={submit} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Registrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============ Quick photo upload ============
function QuickPhotoUpload({ viagemId, onDone }: { viagemId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-auto flex-col gap-1 py-3" onClick={() => setOpen(true)}>
        <Camera className="size-4" />
        <span className="text-xs">Adicionar foto</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adicionar foto à viagem</DialogTitle></DialogHeader>
          <UploadFotos viagemId={viagemId} categoria="outro" label="Foto" onChange={() => onDone()} />
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============ Finalizar Viagem ============
function FinalizarViagemDialog({ viagemId, kmInicial, onDone, autoOpen }: { viagemId: string; kmInicial: number | null; onDone: () => void; autoOpen?: boolean }) {
  const [open, setOpen] = useState(false);
  const openedOnce = useRef(false);
  useEffect(() => {
    if (autoOpen && !openedOnce.current) {
      openedOnce.current = true;
      setOpen(true);
    }
  }, [autoOpen]);

  const [dataEnc, setDataEnc] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [kmFinal, setKmFinal] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const kmInvalido = kmInicial != null && kmFinal && Number(kmFinal) < kmInicial;

  const submit = async () => {
    if (!kmFinal || kmInvalido) return;
    setSalvando(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      // salva checklist de chegada simples para manter histórico
      await supabase.from("checklists").insert({
        viagem_id: viagemId,
        tipo: "chegada",
        km: Number(kmFinal),
        itens: {},
        observacoes: obs || null,
        created_by: userData.user?.id,
      });

      const { error } = await supabase
        .from("viagens")
        .update({
          status: "concluida",
          data_chegada: new Date(dataEnc).toISOString(),
          km_final: Number(kmFinal),
          observacoes_finais: obs || null,
          finalizada_por: userData.user?.id,
        })
        .eq("id", viagemId);
      if (error) throw error;

      toast.success("Viagem finalizada!");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error("Erro", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="secondary" className="w-full py-6 text-base md:w-auto">
        <CheckCircle2 className="mr-2 size-5" /> Finalizar Viagem
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Encerramento da viagem</DialogTitle>
            <DialogDescription>Anexe o canhoto e fotos de entrega para concluir.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Data e hora do encerramento</Label>
                <Input type="datetime-local" value={dataEnc} onChange={(e) => setDataEnc(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Quilometragem final {kmInicial != null && <span className="text-xs text-muted-foreground">(inicial: {kmInicial})</span>}</Label>
                <Input type="number" value={kmFinal} onChange={(e) => setKmFinal(e.target.value)} />
                {kmInvalido && <p className="text-xs text-destructive">Km final não pode ser menor que o inicial</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações finais</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>

            <section className="space-y-2 rounded-lg border border-border/60 p-3">
              <Label className="flex items-center gap-1 font-semibold"><Receipt className="size-4" /> Canhoto assinado</Label>
              <p className="text-xs text-muted-foreground">Foto ou PDF.</p>
              <UploadFotos viagemId={viagemId} categoria="canhoto" label="Anexar canhoto" accept="image/*,application/pdf" multiple={false} />
            </section>

            <section className="space-y-2 rounded-lg border border-border/60 p-3">
              <Label className="font-semibold">Fotos de entrega</Label>
              <UploadFotos viagemId={viagemId} categoria="entrega" label="Adicionar fotos" />
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={!kmFinal || !!kmInvalido || salvando} className="bg-brand hover:bg-brand/90">
              {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Concluir viagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProvisionamentosSection({
  viagemId,
  km,
  kmEstimado,
  receita,
  movimentacoes,
  comissaoPctSalvo,
  pedagioEstimado,
  outrosEstimados,
  manutencaoSalva,
  pneusSalvo,
  onSaved,
}: {
  viagemId: string;
  km: number | null;
  kmEstimado: boolean;
  receita: number;
  movimentacoes: any[];
  comissaoPctSalvo: number | null;
  pedagioEstimado: number | null;
  outrosEstimados: number | null;
  manutencaoSalva: number | null;
  pneusSalvo: number | null;
  onSaved: () => void;
}) {
  const [manutKm, setManutKm] = useState<string>(manutencaoSalva ? String(manutencaoSalva) : "");
  const [pneusKm, setPneusKm] = useState<string>(pneusSalvo ? String(pneusSalvo) : "");
  const [comissaoPct, setComissaoPct] = useState<string>(comissaoPctSalvo ? String(comissaoPctSalvo) : "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase
      .from("viagens")
      .update({
        provisao_manutencao_km: Number(manutKm) > 0 ? Number(manutKm) : null,
        provisao_pneus_km: Number(pneusKm) > 0 ? Number(pneusKm) : null,
        comissao_percentual: Number(comissaoPct) > 0 ? Number(comissaoPct) : null,
        comissao_valor:
          Number(comissaoPct) > 0 && receita > 0 ? (receita * Number(comissaoPct)) / 100 : null,
      })
      .eq("id", viagemId);
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar os provisionamentos.");
    toast.success("Provisionamentos salvos nesta viagem.");
    onSaved();
  };

  const bucket = (pred: (m: any) => boolean) =>
    movimentacoes
      .filter((m) => m.tipo === "pagar" && m.status !== "cancelado" && pred(m))
      .reduce((s, m) => s + Number(m.valor ?? 0), 0);

  const cat = (m: any) => `${m.categoria ?? ""} ${m.centro_custo ?? ""}`.toLowerCase();
  const combustivel = bucket((m) => cat(m).includes("combust"));
  const pedagioLancado = bucket((m) => cat(m).includes("pedágio") || cat(m).includes("pedagio"));
  const comissaoLancada = bucket((m) => cat(m).includes("comiss"));
  const outrosLancados = bucket(
    (m) => !cat(m).includes("combust") && !cat(m).includes("pedágio") && !cat(m).includes("pedagio") && !cat(m).includes("comiss"),
  );

  // Lançamento real prevalece; sem lançamento, mantemos o valor planejado.
  const comissao =
    comissaoLancada > 0
      ? comissaoLancada
      : Number(comissaoPct) > 0 && receita > 0
        ? (receita * Number(comissaoPct)) / 100
        : 0;
  const pedagio = pedagioLancado > 0 ? pedagioLancado : (pedagioEstimado ?? 0);
  const outros = outrosLancados > 0 ? outrosLancados : (outrosEstimados ?? 0);

  const custos = {
    receita,
    combustivel,
    pedagio,
    comissao,
    provisaoManutencao: calcularProvisao(km, manutKm),
    provisaoPneus: calcularProvisao(km, pneusKm),
    outros,
    km,
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-bold">Provisionamentos operacionais</h2>
      <Card className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">
          Valores planejados desta viagem. Em branco ou zero não entram no cálculo.
          {km
            ? ` Distância considerada: ${km.toFixed(0)} km${kmEstimado ? " (estimada do planejamento)" : ""}.`
            : " Informe km inicial e final para calcular."}
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Comissão do motorista (%)</Label>
            <Input type="number" step="0.1" placeholder="Ex.: 10" value={comissaoPct} onChange={(e) => setComissaoPct(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Comissão: {brl(custos.comissao)}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Manutenção (R$/km)</Label>
            <Input type="number" step="0.01" placeholder="Ex.: 0,60" value={manutKm} onChange={(e) => setManutKm(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Provisão: {brl(custos.provisaoManutencao)}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Pneus (R$/km)</Label>
            <Input type="number" step="0.01" placeholder="Ex.: 0,15" value={pneusKm} onChange={(e) => setPneusKm(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Provisão: {brl(custos.provisaoPneus)}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar provisionamentos
          </Button>
        </div>
      </Card>

      <h2 className="font-display text-lg font-bold">Demonstrativo financeiro</h2>
      <DemonstrativoViagem custos={custos} />
    </div>
  );
}

