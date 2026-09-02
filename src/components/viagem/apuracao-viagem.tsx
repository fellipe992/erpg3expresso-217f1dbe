import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  apurarViagem,
  brl,
  carregarTabela,
  faixaEquivalente,
  listarAjustes,
  listarTipologias,
  nnum,
  precoDe,
  rotuloFaixa,
  type ViagemAjuste,
} from "@/lib/frete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type ViagemApuracao = {
  id: string;
  cliente_id: string | null;
  valor_frete: number | string | null;
  frete_motorista: number | string | null;
  pedagio_cliente: number | string | null;
  pedagio_motorista: number | string | null;
  usar_tabela_cliente: boolean | null;
  frete_faixa_id: string | null;
  veiculo?: { placa?: string | null; tipo?: string | null; tipologia_id?: string | null } | null;
};

/** Área financeira da viagem: tabela de frete, pedágios, descontos, adicionais e resumo. */
export function ApuracaoViagemSection({
  viagem,
  onSaved,
}: {
  viagem: ViagemApuracao;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [usarTabela, setUsarTabela] = useState(!!viagem.usar_tabela_cliente);
  const [faixaId, setFaixaId] = useState<string | null>(viagem.frete_faixa_id ?? null);
  const [freteCliente, setFreteCliente] = useState(viagem.valor_frete != null ? String(viagem.valor_frete) : "");
  const [freteMotorista, setFreteMotorista] = useState(
    viagem.frete_motorista != null ? String(viagem.frete_motorista) : "",
  );
  const [pedagioCliente, setPedagioCliente] = useState(
    viagem.pedagio_cliente != null ? String(viagem.pedagio_cliente) : "",
  );
  const [pedagioMotorista, setPedagioMotorista] = useState(
    viagem.pedagio_motorista != null ? String(viagem.pedagio_motorista) : "",
  );
  const [pedagioIgual, setPedagioIgual] = useState(
    viagem.pedagio_cliente == null ||
      viagem.pedagio_motorista == null ||
      Number(viagem.pedagio_cliente) === Number(viagem.pedagio_motorista),
  );
  const [salvando, setSalvando] = useState(false);

  const { data: tipologias = [] } = useQuery({ queryKey: ["tipologias"], queryFn: listarTipologias });
  const clienteId = viagem.cliente_id;

  const { data: tabCliente } = useQuery({
    queryKey: ["frete-tabela", clienteId, "cliente"],
    enabled: !!clienteId,
    queryFn: () => carregarTabela(clienteId!, "cliente"),
  });
  const { data: tabMotorista } = useQuery({
    queryKey: ["frete-tabela", clienteId, "motorista"],
    enabled: !!clienteId,
    queryFn: () => carregarTabela(clienteId!, "motorista"),
  });

  const { data: ajustes = [] } = useQuery({
    queryKey: ["viagem-ajustes", viagem.id],
    queryFn: () => listarAjustes(viagem.id),
  });

  /** Tipologia lida automaticamente do veículo da viagem. */
  const tipologia = useMemo(() => {
    const v = viagem.veiculo;
    if (!v) return null;
    if (v.tipologia_id) return tipologias.find((t) => t.id === v.tipologia_id) ?? null;
    return tipologias.find((t) => t.codigo === (v.tipo ?? "")) ?? null;
  }, [viagem.veiculo, tipologias]);

  const faixaSelecionada = (tabCliente?.faixas ?? []).find((f) => f.id === faixaId) ?? null;
  const faixaMot = faixaEquivalente(tabMotorista?.faixas ?? [], faixaSelecionada);

  const precoTabelaCliente = precoDe(tabCliente?.precos ?? [], faixaId, tipologia?.id ?? null);
  const precoTabelaMotorista = precoDe(tabMotorista?.precos ?? [], faixaMot?.id ?? null, tipologia?.id ?? null);

  // Com a tabela ativa, o frete do cliente segue a tabela; o do motorista sempre pode vir da tabela dele.
  useEffect(() => {
    if (usarTabela && precoTabelaCliente != null) setFreteCliente(String(precoTabelaCliente));
  }, [usarTabela, precoTabelaCliente]);
  useEffect(() => {
    if (precoTabelaMotorista != null) setFreteMotorista(String(precoTabelaMotorista));
  }, [precoTabelaMotorista]);

  const apuracao = apurarViagem({
    freteCliente: nnum(freteCliente),
    freteMotorista: nnum(freteMotorista),
    pedagioCliente: nnum(pedagioCliente),
    pedagioMotorista: nnum(pedagioIgual ? pedagioCliente : pedagioMotorista),
    ajustes,
  });

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase
      .from("viagens")
      .update({
        usar_tabela_cliente: usarTabela,
        frete_faixa_id: usarTabela ? faixaId : null,
        valor_frete: nnum(freteCliente) > 0 ? nnum(freteCliente) : null,
        frete_motorista: nnum(freteMotorista) > 0 ? nnum(freteMotorista) : null,
        pedagio_cliente: nnum(pedagioCliente) > 0 ? nnum(pedagioCliente) : null,
        pedagio_motorista:
          nnum(pedagioIgual ? pedagioCliente : pedagioMotorista) > 0
            ? nnum(pedagioIgual ? pedagioCliente : pedagioMotorista)
            : null,
      })
      .eq("id", viagem.id);
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar a apuração.", { description: error.message });
    toast.success("Apuração da viagem salva.");
    qc.invalidateQueries({ queryKey: ["fechamento-viagens"] });
    onSaved();
  };

  const removerAjuste = async (id: string) => {
    const { error } = await supabase.from("viagem_ajustes").delete().eq("id", id);
    if (error) return toast.error("Não foi possível remover.");
    qc.invalidateQueries({ queryKey: ["viagem-ajustes", viagem.id] });
  };

  const descontos = ajustes.filter((a) => a.tipo === "desconto");
  const adicionais = ajustes.filter((a) => a.tipo === "adicional");

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-bold">Apuração financeira da viagem</h2>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={usarTabela} onCheckedChange={setUsarTabela} id="usar-tabela" />
            <Label htmlFor="usar-tabela">Utilizar tabela de frete do cliente</Label>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Tipologia do veículo:</span>
            <Badge variant="outline">{tipologia?.nome ?? "não identificada"}</Badge>
            {viagem.veiculo?.placa && <span className="font-mono">{viagem.veiculo.placa}</span>}
          </div>
        </div>

        {usarTabela && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Raio da viagem</Label>
              <Select value={faixaId ?? ""} onValueChange={(v) => setFaixaId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder={(tabCliente?.faixas.length ?? 0) ? "Selecione a faixa" : "Cliente sem tabela"} />
                </SelectTrigger>
                <SelectContent>
                  {(tabCliente?.faixas ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {rotuloFaixa(f)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground md:pt-6">
              {precoTabelaCliente != null
                ? `Tabela do cliente: ${brl(precoTabelaCliente)}`
                : "Sem preço na tabela do cliente para esta faixa/tipologia."}
              <br />
              {precoTabelaMotorista != null
                ? `Tabela do motorista: ${brl(precoTabelaMotorista)}`
                : "Sem preço na tabela do motorista para esta faixa/tipologia."}
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Frete cliente (R$)</Label>
            <DecimalInput value={freteCliente} onChange={setFreteCliente} disabled={usarTabela} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Frete motorista (R$)</Label>
            <DecimalInput value={freteMotorista} onChange={setFreteMotorista} />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="pedagio-igual"
              checked={pedagioIgual}
              onCheckedChange={(v) => setPedagioIgual(!!v)}
            />
            <Label htmlFor="pedagio-igual" className="text-xs">
              Pedágio igual para cliente e motorista
            </Label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{pedagioIgual ? "Pedágio (R$)" : "Pedágio cliente (R$)"}</Label>
              <DecimalInput value={pedagioCliente} onChange={setPedagioCliente} />
            </div>
            {!pedagioIgual && (
              <div className="space-y-1.5">
                <Label className="text-xs">Pedágio motorista (R$)</Label>
                <DecimalInput value={pedagioMotorista} onChange={setPedagioMotorista} />
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar apuração
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <ListaAjustes
          titulo="Descontos"
          tipo="desconto"
          viagemId={viagem.id}
          itens={descontos}
          onRemover={removerAjuste}
        />
        <ListaAjustes
          titulo="Adicionais"
          tipo="adicional"
          viagemId={viagem.id}
          itens={adicionais}
          onRemover={removerAjuste}
        />
      </div>

      <Card className="grid gap-px overflow-hidden bg-border/60 md:grid-cols-2">
        <ResumoLado titulo="Cliente" lado={apuracao.cliente} />
        <ResumoLado titulo="Motorista" lado={apuracao.motorista} />
      </Card>
    </div>
  );
}

function ResumoLado({ titulo, lado }: { titulo: string; lado: ReturnType<typeof apurarViagem>["cliente"] }) {
  const linhas: [string, number, boolean?][] = [
    [`Frete ${titulo.toLowerCase()}`, lado.frete],
    ["+ Pedágio", lado.pedagio],
    ["+ Adicionais", lado.adicionais],
    ["- Descontos", lado.descontos, true],
  ];
  return (
    <div className="bg-card p-4">
      <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Total {titulo}</div>
      <div className="divide-y divide-border/50">
        {linhas.map(([label, valor, negativo]) => (
          <div key={label} className="flex items-center justify-between py-1.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("font-mono tabular-nums", negativo && valor > 0 && "text-destructive")}>
              {brl(valor)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 text-sm font-semibold">
          <span>TOTAL {titulo.toUpperCase()}</span>
          <span className="font-mono tabular-nums">{brl(lado.total)}</span>
        </div>
      </div>
    </div>
  );
}

function ListaAjustes({
  titulo,
  tipo,
  viagemId,
  itens,
  onRemover,
}: {
  titulo: string;
  tipo: "desconto" | "adicional";
  viagemId: string;
  itens: ViagemAjuste[];
  onRemover: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [igual, setIgual] = useState(true);
  const [valorCliente, setValorCliente] = useState("");
  const [valorMotorista, setValorMotorista] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!descricao.trim()) return toast.error("Informe a descrição.");
    const vc = nnum(valorCliente);
    const vm = igual ? vc : nnum(valorMotorista);
    if (vc <= 0 && vm <= 0) return toast.error("Informe um valor maior que zero.");
    setSalvando(true);
    const { error } = await supabase.from("viagem_ajustes").insert({
      viagem_id: viagemId,
      tipo,
      descricao: descricao.trim(),
      valor_cliente: vc > 0 ? vc : 0,
      valor_motorista: vm > 0 ? vm : 0,
    });
    setSalvando(false);
    if (error) return toast.error(`Não foi possível lançar o ${tipo}.`, { description: error.message });
    setDescricao("");
    setValorCliente("");
    setValorMotorista("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["viagem-ajustes", viagemId] });
  };

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{titulo}</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1 size-4" /> Adicionar
          </Button>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo {tipo}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição</Label>
                <Input
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder={tipo === "desconto" ? "Ex.: Mercadoria avariada" : "Ex.: Chapa"}
                />
              </div>
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-2">
                  <Checkbox id={`ig-${tipo}`} checked={igual} onCheckedChange={(v) => setIgual(!!v)} />
                  <Label htmlFor={`ig-${tipo}`} className="text-xs">
                    Mesmo valor para cliente e motorista
                  </Label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {igual ? "Valor (R$)" : `${tipo === "desconto" ? "Desconto" : "Adicional"} cliente (R$)`}
                    </Label>
                    <DecimalInput value={valorCliente} onChange={setValorCliente} />
                  </div>
                  {!igual && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        {tipo === "desconto" ? "Desconto" : "Adicional"} motorista (R$)
                      </Label>
                      <DecimalInput value={valorMotorista} onChange={setValorMotorista} />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Deixe um dos campos em zero para aplicar o {tipo} somente ao outro lado.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Lançar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {itens.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Nenhum {tipo} lançado.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {itens.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{a.descricao}</div>
                <div className="text-xs text-muted-foreground">
                  Cliente {brl(a.valor_cliente)} · Motorista {brl(a.valor_motorista)}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => onRemover(a.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
