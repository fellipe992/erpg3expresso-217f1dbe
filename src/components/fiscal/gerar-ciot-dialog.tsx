import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { gerarCiot, statusCiot } from "@/lib/ciot.functions";
import { rotuloProvedorCiot, type ProvedorCiot, type TipoContratado } from "@/lib/ciot-tipos";
import { nnum } from "@/lib/frete";
import { brl } from "@/lib/export-utils";
import { Button } from "@/components/ui/button";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const hoje = () => new Date().toISOString().slice(0, 10);

export function GerarCiotDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const gerar = useServerFn(gerarCiot);
  const status = useServerFn(statusCiot);
  const { data: disponibilidade } = useQuery({
    queryKey: ["ciot-status"],
    enabled: open,
    queryFn: () => status({}),
  });

  const [provedor, setProvedor] = useState<ProvedorCiot>("manual");
  const [tipo, setTipo] = useState<TipoContratado>("TAC");
  const [viagemId, setViagemId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [rntrc, setRntrc] = useState("");
  const [frete, setFrete] = useState("");
  const [adiantamento, setAdiantamento] = useState("");
  const [quitacao, setQuitacao] = useState("");
  const [distancia, setDistancia] = useState("");
  const [data, setData] = useState(hoje());
  const [numero, setNumero] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const { data: viagens = [] } = useQuery({
    queryKey: ["viagens-ciot"],
    enabled: open,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("viagens")
        .select(
          "id, codigo, cliente_id, motorista_id, veiculo_id, origem_cidade, destino_cidade, frete_motorista, valor_frete, distancia_estimada_km",
        )
        .in("status", ["planejada", "em_andamento", "concluida"])
        .order("created_at", { ascending: false })
        .limit(200);
      return (rows ?? []) as Array<Record<string, string | number | null>>;
    },
  });

  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas-ciot"],
    enabled: open,
    queryFn: async () => {
      const { data: rows } = await supabase.from("motoristas").select("id, nome, cpf").order("nome");
      return (rows ?? []) as Array<{ id: string; nome: string; cpf: string | null }>;
    },
  });

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-ciot"],
    enabled: open,
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("veiculos")
        .select("id, placa, agregado, proprietario_nome, proprietario_documento")
        .order("placa");
      return (rows ?? []) as Array<Record<string, string | boolean | null>>;
    },
  });

  const viagem = viagens.find((v) => String(v["id"]) === viagemId);

  // Ao escolher a viagem, herda motorista, veículo, valor do frete e distância.
  useEffect(() => {
    if (!viagem) return;
    if (viagem["motorista_id"]) setMotoristaId(String(viagem["motorista_id"]));
    if (viagem["veiculo_id"]) setVeiculoId(String(viagem["veiculo_id"]));
    const valor = Number(viagem["frete_motorista"] ?? 0) || Number(viagem["valor_frete"] ?? 0);
    if (valor) setFrete(String(valor).replace(".", ","));
    const km = Number(viagem["distancia_estimada_km"] ?? 0);
    if (km) setDistancia(String(km).replace(".", ","));
  }, [viagem]);

  // O contratado é o dono do veículo agregado; sem agregado, o próprio motorista.
  useEffect(() => {
    const v = veiculos.find((x) => String(x["id"]) === veiculoId);
    if (v?.["agregado"] && v["proprietario_nome"]) {
      setNome(String(v["proprietario_nome"]));
      setDocumento(String(v["proprietario_documento"] ?? ""));
      return;
    }
    const m = motoristas.find((x) => x.id === motoristaId);
    if (m) {
      setNome(m.nome);
      setDocumento(m.cpf ?? "");
    }
  }, [veiculoId, motoristaId, veiculos, motoristas]);

  const total = nnum(frete);
  const restante = total - nnum(adiantamento) - nnum(quitacao);

  const salvar = useMutation({
    mutationFn: () =>
      gerar({
        data: {
          provedor,
          tipoContratado: tipo,
          contratadoNome: nome,
          contratadoDocumento: documento,
          contratadoRntrc: rntrc,
          valorFrete: nnum(frete),
          valorAdiantamento: nnum(adiantamento),
          valorQuitacao: nnum(quitacao),
          distanciaKm: nnum(distancia),
          dataEmissao: data,
          numeroCiot: numero,
          observacoes,
          viagemId: viagemId || null,
          clienteId: viagem?.["cliente_id"] ? String(viagem["cliente_id"]) : null,
          motoristaId: motoristaId || null,
          veiculoId: veiculoId || null,
        },
      }),
    onSuccess: (r) => {
      toast.success(r.numero ? `CIOT ${r.numero} registrado` : "CIOT enviado para geração");
      onDone();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Não foi possível gerar o CIOT", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar CIOT</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Como o CIOT será obtido">
              <Select value={provedor} onValueChange={(v) => setProvedor(v as ProvedorCiot)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{rotuloProvedorCiot.manual}</SelectItem>
                  <SelectItem value="gestora">
                    {rotuloProvedorCiot.gestora}
                    {disponibilidade && !disponibilidade.gestora ? " (não configurada)" : ""}
                  </SelectItem>
                  <SelectItem value="bsoft">
                    {rotuloProvedorCiot.bsoft}
                    {disponibilidade && !disponibilidade.bsoft ? " (não configurado)" : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Tipo de contratado">
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContratado)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TAC">TAC — autônomo</SelectItem>
                  <SelectItem value="ETC">ETC — empresa de transporte</SelectItem>
                  <SelectItem value="CTC">CTC — cooperativa</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Viagem">
              <Select value={viagemId} onValueChange={setViagemId}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {viagens.map((v) => (
                    <SelectItem key={String(v["id"])} value={String(v["id"])}>
                      {(v["codigo"] as string) ?? "—"} · {v["origem_cidade"]} → {v["destino_cidade"]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Data de emissão">
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
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
                    <SelectItem key={String(v["id"])} value={String(v["id"])}>{String(v["placa"])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Transportador contratado">
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </Campo>
            <Campo label="CPF / CNPJ do contratado">
              <Input value={documento} onChange={(e) => setDocumento(e.target.value)} />
            </Campo>
            <Campo label="RNTRC do contratado">
              <Input value={rntrc} onChange={(e) => setRntrc(e.target.value)} />
            </Campo>
            <Campo label="Distância (km)">
              <DecimalInput value={distancia} onChange={setDistancia} placeholder="0,00" />
            </Campo>
            <Campo label="Valor do frete contratado">
              <DecimalInput value={frete} onChange={setFrete} placeholder="0,00" />
            </Campo>
            <Campo label="Adiantamento">
              <DecimalInput value={adiantamento} onChange={setAdiantamento} placeholder="0,00" />
            </Campo>
            <Campo label="Quitação (saldo)">
              <DecimalInput value={quitacao} onChange={setQuitacao} placeholder="0,00" />
            </Campo>
            {provedor === "manual" && (
              <Campo label="Número do CIOT">
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 123456789012" />
              </Campo>
            )}
            <div className="sm:col-span-2">
              <Campo label="Observações">
                <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </Campo>
            </div>
          </div>

          <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between font-semibold">
              <span>Frete contratado</span>
              <span className="font-mono tabular-nums">{brl(total)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Não distribuído entre adiantamento e quitação</span>
              <span className="font-mono tabular-nums">{brl(restante)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {provedor === "manual" ? "Registrar CIOT" : "Gerar CIOT"}
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
