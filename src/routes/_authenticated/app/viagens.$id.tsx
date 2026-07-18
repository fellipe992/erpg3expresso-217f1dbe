import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
  Camera,
  Fuel,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
import { Checkbox } from "@/components/ui/checkbox";

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

const CHECKLIST_ITENS_SAIDA = [
  "Pneus (pressão e desgaste)",
  "Óleo do motor",
  "Água do radiador",
  "Faróis e lanternas",
  "Freios",
  "Documentos do veículo",
  "Extintor",
  "Triângulo e macaco",
  "Carga conferida",
  "Lona / amarração",
];

const CHECKLIST_ITENS_CHEGADA = [
  "Carga entregue",
  "Canhoto assinado",
  "Veículo sem avarias",
  "Documentos recebidos",
  "Pneus em ordem",
  "Combustível registrado",
];

function ViagemDetalheePage() {
  const { id } = Route.useParams();
  const { role } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMotorista = role === "motorista";
  const canWrite = role === "administrador" || role === "gestor" || role === "financeiro";

  const { data: viagem, isLoading } = useQuery({
    queryKey: ["viagem", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viagens")
        .select("*, cliente:clientes(razao_social, cidade, uf), motorista:motoristas(nome, telefone), veiculo:veiculos(placa, modelo, marca)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ["checklists", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklists")
        .select("*")
        .eq("viagem_id", id)
        .order("created_at");
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

  const startTrip = useMutation({
    mutationFn: async (km: number) => {
      const { error } = await supabase
        .from("viagens")
        .update({ status: "em_andamento", data_saida: new Date().toISOString(), km_inicial: km })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Viagem iniciada");
      qc.invalidateQueries({ queryKey: ["viagem", id] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
      qc.invalidateQueries({ queryKey: ["viagens"] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const finishTrip = useMutation({
    mutationFn: async (km: number) => {
      const { error } = await supabase
        .from("viagens")
        .update({ status: "concluida", data_chegada: new Date().toISOString(), km_final: km })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Viagem concluída");
      qc.invalidateQueries({ queryKey: ["viagem", id] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
      qc.invalidateQueries({ queryKey: ["viagens"] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
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

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/app/viagens" })} className="-ml-2">
        <ArrowLeft className="mr-1 size-4" /> Voltar
      </Button>

      <Card className="overflow-hidden">
        <div className="border-b border-border/60 bg-brand-subtle/40 p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant={STATUS_META[viagem.status as keyof typeof STATUS_META].variant}>
                  {STATUS_META[viagem.status as keyof typeof STATUS_META].label}
                </Badge>
                {viagem.codigo && <span className="font-mono text-xs text-muted-foreground">#{viagem.codigo}</span>}
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
          <Info
            label="Veículo"
            value={viagem.veiculo ? `${viagem.veiculo.placa} — ${viagem.veiculo.modelo}` : "—"}
          />
          <Info
            label="Valor do frete"
            value={viagem.valor_frete ? Number(viagem.valor_frete).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}
          />
          <Info
            label="Saída prevista"
            value={viagem.data_prevista_saida ? new Date(viagem.data_prevista_saida).toLocaleString("pt-BR") : "—"}
          />
          <Info
            label="Chegada prevista"
            value={viagem.data_prevista_chegada ? new Date(viagem.data_prevista_chegada).toLocaleString("pt-BR") : "—"}
          />
          <Info
            label="Saída real"
            value={viagem.data_saida ? new Date(viagem.data_saida).toLocaleString("pt-BR") : "—"}
          />
          <Info
            label="Chegada real"
            value={viagem.data_chegada ? new Date(viagem.data_chegada).toLocaleString("pt-BR") : "—"}
          />
          <Info label="Km inicial" value={viagem.km_inicial ? `${viagem.km_inicial} km` : "—"} />
          <Info label="Km final" value={viagem.km_final ? `${viagem.km_final} km` : "—"} />
          {kmRodado !== null && (
            <Info label="Km rodado" value={<span className="font-semibold text-brand">{kmRodado} km</span>} />
          )}
        </div>

        {viagem.observacoes && (
          <>
            <Separator />
            <div className="p-4 md:p-6">
              <Label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">Observações</Label>
              <p className="whitespace-pre-wrap text-sm">{viagem.observacoes}</p>
            </div>
          </>
        )}
      </Card>

      {/* Ações rápidas do motorista / operacional */}
      {viagem.status !== "cancelada" && viagem.status !== "concluida" && (
        <div className="flex flex-wrap gap-2">
          {viagem.status === "planejada" && (
            <IniciarViagemDialog
              disabled={!hasSaida}
              onConfirm={(km) => startTrip.mutate(km)}
              pending={startTrip.isPending}
              hint={!hasSaida ? "Preencha o checklist de saída primeiro" : undefined}
            />
          )}
          {viagem.status === "em_andamento" && (
            <FinalizarViagemDialog
              disabled={!hasChegada}
              onConfirm={(km) => finishTrip.mutate(km)}
              pending={finishTrip.isPending}
              hint={!hasChegada ? "Preencha o checklist de chegada primeiro" : undefined}
              kmInicial={viagem.km_inicial ? Number(viagem.km_inicial) : null}
            />
          )}
        </div>
      )}

      {/* Checklists */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Checklists</h2>
          <div className="flex gap-2">
            {!hasSaida && (
              <ChecklistDialog viagemId={id} tipo="saida" />
            )}
            {!hasChegada && viagem.status !== "planejada" && (
              <ChecklistDialog viagemId={id} tipo="chegada" />
            )}
          </div>
        </div>
        {checklists.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum checklist registrado.</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {checklists.map((c) => (
              <ChecklistCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </div>

      {/* Movimentações financeiras da viagem */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold">Movimentações Financeiras da Viagem</h2>
        {movimentacoes.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma movimentação vinculada a esta viagem.</Card>
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

      {canWrite && (
        <div className="pt-4">
          <Button asChild variant="outline">
            <Link to="/app/viagens">Voltar à lista</Link>
          </Button>
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
  const marcados = Object.entries(itens).filter(([, v]) => v).length;
  const total = Object.keys(itens).length;
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
      <div className="mb-2 text-xs text-muted-foreground">
        {marcados}/{total} itens verificados
        {c.km && <> · {c.km} km</>}
        {c.combustivel_pct != null && <> · {c.combustivel_pct}% combustível</>}
      </div>
      <ul className="space-y-1 text-xs">
        {Object.entries(itens).map(([k, v]) => (
          <li key={k} className="flex items-center gap-1.5">
            <CheckCircle2 className={v ? "size-3.5 text-brand" : "size-3.5 text-muted-foreground/40"} />
            <span className={v ? "" : "text-muted-foreground line-through"}>{k}</span>
          </li>
        ))}
      </ul>
      {c.observacoes && (
        <p className="mt-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{c.observacoes}</p>
      )}
    </Card>
  );
}

function ChecklistDialog({ viagemId, tipo }: { viagemId: string; tipo: "saida" | "chegada" }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const itensBase = tipo === "saida" ? CHECKLIST_ITENS_SAIDA : CHECKLIST_ITENS_CHEGADA;
  const [itens, setItens] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(itensBase.map((i) => [i, false])),
  );
  const [km, setKm] = useState<string>("");
  const [combustivel, setCombustivel] = useState<string>("");
  const [obs, setObs] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("checklists").insert({
        viagem_id: viagemId,
        tipo,
        itens: itens as any,
        km: km ? Number(km) : null,
        combustivel_pct: combustivel ? Number(combustivel) : null,
        foto_url: fotoUrl,
        observacoes: obs || null,
        created_by: userData.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Checklist registrado");
      qc.invalidateQueries({ queryKey: ["checklists", viagemId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const path = `${viagemId}/${tipo}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("viagem-fotos").upload(path, file);
      if (error) throw error;
      setFotoUrl(path);
      toast.success("Foto enviada");
    } catch (e) {
      toast.error("Erro no upload", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Button variant={tipo === "saida" ? "default" : "outline"} size="sm" onClick={() => setOpen(true)}>
        <ClipboardCheck className="mr-1.5 size-4" />
        Checklist de {tipo === "saida" ? "saída" : "chegada"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Checklist de {tipo === "saida" ? "saída" : "chegada"}</DialogTitle>
            <DialogDescription>Confira todos os itens antes de salvar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              {itensBase.map((item) => (
                <label key={item} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={itens[item]}
                    onCheckedChange={(v) => setItens({ ...itens, [item]: v === true })}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Km atual</Label>
                <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Fuel className="size-3" /> Combustível (%)</Label>
                <Input type="number" min={0} max={100} value={combustivel} onChange={(e) => setCombustivel(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ocorrências, avarias..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1"><Camera className="size-3" /> Foto (opcional)</Label>
              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                disabled={uploading}
              />
              {fotoUrl && <p className="text-xs text-brand">✓ Foto anexada</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || uploading}>
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function IniciarViagemDialog({
  disabled,
  onConfirm,
  pending,
  hint,
}: {
  disabled: boolean;
  onConfirm: (km: number) => void;
  pending: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [km, setKm] = useState("");
  return (
    <>
      <div className="flex flex-col gap-1">
        <Button onClick={() => setOpen(true)} disabled={disabled} className="bg-brand hover:bg-brand/90">
          <Play className="mr-1.5 size-4" /> Iniciar viagem
        </Button>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Iniciar viagem</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Km inicial do veículo</Label>
            <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => { onConfirm(Number(km)); setOpen(false); }} disabled={pending || !km}>
              Iniciar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FinalizarViagemDialog({
  disabled,
  onConfirm,
  pending,
  hint,
  kmInicial,
}: {
  disabled: boolean;
  onConfirm: (km: number) => void;
  pending: boolean;
  hint?: string;
  kmInicial: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [km, setKm] = useState("");
  const invalido = kmInicial != null && km && Number(km) < kmInicial;
  return (
    <>
      <div className="flex flex-col gap-1">
        <Button onClick={() => setOpen(true)} disabled={disabled} variant="secondary">
          <CheckCircle2 className="mr-1.5 size-4" /> Finalizar viagem
        </Button>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Finalizar viagem</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Km final do veículo{kmInicial != null && ` (inicial: ${kmInicial})`}</Label>
            <Input type="number" value={km} onChange={(e) => setKm(e.target.value)} autoFocus />
            {invalido && <p className="text-xs text-destructive">Km final não pode ser menor que o inicial</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => { onConfirm(Number(km)); setOpen(false); }} disabled={pending || !km || !!invalido}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
