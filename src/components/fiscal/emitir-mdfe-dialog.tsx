import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { emitirMdfe } from "@/lib/fiscal.functions";
import type { DocumentoFiscal, TipoCarga, TipoCarroceria, TipoRodado } from "@/lib/fiscal-tipos";
import { nnum } from "@/lib/frete";
import { brl } from "@/lib/export-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const carrocerias: TipoCarroceria[] = [
  "FECHADA_BAU",
  "ABERTA",
  "SIDER",
  "GRANELEIRA",
  "PORTACONTAINER",
  "NAOAPLICAVEL",
];
const rodados: TipoRodado[] = ["TRUCK", "TOCO", "CAVALOMECANICO", "VAN", "UTILITARIO", "OUTROS", "NAOAPLICAVEL"];
const cargas: TipoCarga[] = [
  "CARGA_GERAL",
  "FRIGORIFICADA",
  "CONTEINERIZADA",
  "GRANEL_SOLIDO",
  "GRANEL_LIQUIDO",
  "NEOGRANEL",
];

export function EmitirMdfeDialog({
  open,
  onOpenChange,
  ctes,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ctes: DocumentoFiscal[];
  onDone: () => void;
}) {
  const emitir = useServerFn(emitirMdfe);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [inicio, setInicio] = useState({ municipio: "", uf: "" });
  const [termino, setTermino] = useState({ municipio: "", uf: "" });
  const [percurso, setPercurso] = useState("");
  const [peso, setPeso] = useState("");
  const [produto, setProduto] = useState("Carga geral");
  const [tipoCarga, setTipoCarga] = useState<TipoCarga>("CARGA_GERAL");
  const [motoristaId, setMotoristaId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [tara, setTara] = useState("");
  const [carroceria, setCarroceria] = useState<TipoCarroceria>("FECHADA_BAU");
  const [rodado, setRodado] = useState<TipoRodado>("TRUCK");
  const [observacao, setObservacao] = useState("");
  const [ciotId, setCiotId] = useState("");

  const disponiveis = useMemo(() => ctes.filter((c) => c.status === "autorizado" && c.chave_acesso), [ctes]);
  const selecionados = disponiveis.filter((c) => sel[c.id]);
  const valorTotal = selecionados.reduce((s, c) => s + Number(c.valor ?? 0), 0);

  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas-mdfe"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("motoristas").select("id, nome, cpf").eq("ativo", true).order("nome");
      return (data ?? []) as Array<{ id: string; nome: string; cpf: string | null }>;
    },
  });

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-mdfe"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("veiculos")
        .select("id, placa, renavam, capacidade_kg, tipo, agregado")
        .eq("ativo", true)
        .order("placa");
      return (data ?? []) as Array<Record<string, string | number | boolean | null>>;
    },
  });

  // CIOTs já emitidos, para informar no manifesto quando o frete é de terceiro.
  const { data: ciots = [] } = useQuery({
    queryKey: ["ciots-emitidos-mdfe"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("fiscal_ciots")
        .select("id, numero_ciot, contratado_nome, data_emissao")
        .eq("status", "emitido")
        .not("numero_ciot", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as Array<{
        id: string;
        numero_ciot: string | null;
        contratado_nome: string;
        data_emissao: string;
      }>;
    },
  });

  const veiculo = veiculos.find((v) => String(v["id"]) === veiculoId);
  const motorista = motoristas.find((m) => m.id === motoristaId);
  const ciotSel = ciots.find((c) => c.id === ciotId);


  useEffect(() => {
    if (!veiculo) return;
    const tipo = String(veiculo["tipo"] ?? "");
    const mapa: Record<string, TipoRodado> = {
      truck: "TRUCK",
      toco: "TOCO",
      cavalo: "CAVALOMECANICO",
      van: "VAN",
      utilitario: "UTILITARIO",
    };
    setRodado(mapa[tipo] ?? "OUTROS");
  }, [veiculo]);

  const salvar = useMutation({
    mutationFn: () =>
      emitir({
        data: {
          cteIds: selecionados.map((c) => c.id),
          inicio: { municipio: inicio.municipio, uf: inicio.uf },
          termino: { municipio: termino.municipio, uf: termino.uf },
          ufsPercurso: percurso
            .split(/[\s,;]+/)
            .map((u) => u.trim().toUpperCase())
            .filter(Boolean),
          valorTotal,
          pesoTotalKg: nnum(peso),
          produtoPredominante: produto,
          tipoCarga,
          tipoTransportador: "ETC",
          motorista: { nome: motorista?.nome ?? "", cpf: motorista?.cpf ?? "" },
          veiculo: {
            placa: String(veiculo?.["placa"] ?? ""),
            uf: inicio.uf,
            renavam: String(veiculo?.["renavam"] ?? ""),
            tara: nnum(tara),
            capacidadeKg: Number(veiculo?.["capacidade_kg"] ?? 0) || undefined,
            tipoCarroceria: carroceria,
            tipoRodado: rodado,
            propriedadeVeiculo: veiculo?.["agregado"] ? "TERCEIRO" : "PROPRIO",
          },
          observacao,
          ciot: ciotSel?.numero_ciot ?? null,
          ciotId: ciotId || null,
          veiculoId: veiculoId || null,
          motoristaId: motoristaId || null,

        },
      }),
    onSuccess: () => {
      toast.success("MDF-e enviado para autorização");
      onDone();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Não foi possível emitir o MDF-e", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emitir MDF-e</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              CT-es autorizados
            </div>
            {disponiveis.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhum CT-e autorizado disponível.</div>
            ) : (
              disponiveis.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!sel[c.id]} onCheckedChange={(v) => setSel({ ...sel, [c.id]: !!v })} />
                  <span className="font-mono text-xs">{c.numero ?? "—"}</span>
                  <span className="truncate">{c.cliente?.razao_social ?? "—"}</span>
                  <span className="ml-auto font-mono tabular-nums">{brl(Number(c.valor))}</span>
                </label>
              ))
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Município de início">
              <Input value={inicio.municipio} onChange={(e) => setInicio({ ...inicio, municipio: e.target.value })} />
            </Campo>
            <Campo label="UF de início">
              <Input
                maxLength={2}
                value={inicio.uf}
                onChange={(e) => setInicio({ ...inicio, uf: e.target.value.toUpperCase() })}
              />
            </Campo>
            <Campo label="Município de término">
              <Input value={termino.municipio} onChange={(e) => setTermino({ ...termino, municipio: e.target.value })} />
            </Campo>
            <Campo label="UF de término">
              <Input
                maxLength={2}
                value={termino.uf}
                onChange={(e) => setTermino({ ...termino, uf: e.target.value.toUpperCase() })}
              />
            </Campo>
            <Campo label="UFs de percurso (entre início e término)">
              <Input value={percurso} onChange={(e) => setPercurso(e.target.value)} placeholder="Ex.: MG, RJ" />
            </Campo>
            <Campo label="Peso total (kg)">
              <DecimalInput value={peso} onChange={setPeso} placeholder="0,00" />
            </Campo>
            <Campo label="Produto predominante">
              <Input value={produto} onChange={(e) => setProduto(e.target.value)} />
            </Campo>
            <Campo label="Tipo de carga">
              <Select value={tipoCarga} onValueChange={(v) => setTipoCarga(v as TipoCarga)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cargas.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Motorista">
              <Select value={motoristaId} onValueChange={setMotoristaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {motoristas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Veículo">
              <Select value={veiculoId} onValueChange={setVeiculoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {veiculos.map((v) => (
                    <SelectItem key={String(v["id"])} value={String(v["id"])}>
                      {String(v["placa"])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Tara do veículo (kg)">
              <DecimalInput value={tara} onChange={setTara} placeholder="0,00" />
            </Campo>
            <Campo label="Carroceria">
              <Select value={carroceria} onValueChange={(v) => setCarroceria(v as TipoCarroceria)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {carrocerias.map((c) => (
                    <SelectItem key={c} value={c}>{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Rodado">
              <Select value={rodado} onValueChange={(v) => setRodado(v as TipoRodado)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {rodados.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="CIOT (frete de terceiro)">
              <Select value={ciotId} onValueChange={setCiotId}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  {ciots.length === 0 ? (
                    <SelectItem value="" disabled>Nenhum CIOT emitido</SelectItem>
                  ) : (
                    ciots.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.numero_ciot} · {c.contratado_nome}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Campo>
            <div className="sm:col-span-2">

              <Campo label="Observações">
                <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
              </Campo>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm font-semibold">
            <span>{selecionados.length} CT-e(s) no manifesto</span>
            <span className="font-mono tabular-nums">{brl(valorTotal)}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !selecionados.length}>
            {salvar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Emitir MDF-e
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
