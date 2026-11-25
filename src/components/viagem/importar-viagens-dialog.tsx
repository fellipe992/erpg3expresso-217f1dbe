import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lerAgendamentoPrint } from "@/lib/importar-viagem.functions";
import {
  casarMotorista,
  casarVeiculo,
  dataPrevistaPorOpcao,
  formatarEnderecoParada,
  type AgendamentoExtraido,
  type DestinoExtraido,
} from "@/lib/importar-viagem";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, MapPin, Trash2, Upload } from "lucide-react";

const CLIENTE_STORAGE_KEY = "g3:importar-viagem:ultimo-cliente";

type ViagemRascunho = {
  uid: string;
  arquivoNome: string;
  extraido: AgendamentoExtraido;
  veiculoId: string;
  motoristaId: string;
  destinos: DestinoExtraido[];
  duplicada: boolean;
  lancada: boolean;
};

async function arquivoParaBase64(file: File): Promise<{ b64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? "");
      const idx = res.indexOf(",");
      resolve({ b64: idx >= 0 ? res.slice(idx + 1) : res, mime: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

export function ImportarViagensDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}) {
  const lerPrintFn = useServerFn(lerAgendamentoPrint);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [arquivos, setArquivos] = useState<File[]>([]);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [rascunhos, setRascunhos] = useState<ViagemRascunho[]>([]);
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const [opcaoData, setOpcaoData] = useState<"hoje" | "amanha">("amanha");
  const [clienteId, setClienteId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(CLIENTE_STORAGE_KEY) ?? "";
  });
  const [lancando, setLancando] = useState(false);

  const { data: veiculos = [] } = useQuery({
    queryKey: ["importar-veiculos"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("veiculos")
        .select("id, placa, modelo")
        .eq("ativo", true)
        .order("placa");
      return data ?? [];
    },
  });

  const { data: motoristas = [] } = useQuery({
    queryKey: ["importar-motoristas"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("motoristas")
        .select("id, nome, cpf, veiculo_id")
        .eq("ativo", true)
        .order("nome");
      return data ?? [];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["importar-clientes"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, razao_social")
        .eq("ativo", true)
        .order("razao_social");
      return data ?? [];
    },
  });

  const { data: obsRecentes = [] } = useQuery({
    queryKey: ["importar-obs-recentes"],
    enabled: open,
    queryFn: async () => {
      const desde = new Date(Date.now() - 14 * 86400_000).toISOString();
      const { data } = await supabase
        .from("viagens")
        .select("observacoes")
        .gte("created_at", desde)
        .not("observacoes", "is", null);
      return (data ?? []).map((r) => (r.observacoes ?? "").toUpperCase());
    },
  });

  const dataHoje = useMemo(() => dataPrevistaPorOpcao("hoje"), []);
  const dataAmanha = useMemo(() => dataPrevistaPorOpcao("amanha"), []);
  const dataSelecionada = opcaoData === "hoje" ? dataHoje : dataAmanha;

  const resetar = () => {
    setArquivos([]);
    setRascunhos([]);
    setIndiceAtivo(0);
    setProgresso("");
    setOpcaoData("amanha");
  };

  const handleFechar = (v: boolean) => {
    if (!v && !lendo && !lancando) resetar();
    onOpenChange(v);
  };

  const handleSelecionarArquivos = (files: FileList | null) => {
    if (!files?.length) return;
    const imagens = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imagens.length) {
      toast.error("Selecione apenas imagens (prints).");
      return;
    }
    setArquivos((prev) => [...prev, ...imagens]);
  };

  const lerPrints = async () => {
    if (!arquivos.length) return;
    setLendo(true);
    const novos: ViagemRascunho[] = [];
    const viagensClienteVistas = new Set<string>();

    try {
      for (let i = 0; i < arquivos.length; i++) {
        const arq = arquivos[i]!;
        setProgresso(`Lendo print ${i + 1} de ${arquivos.length}...`);
        try {
          const { b64, mime } = await arquivoParaBase64(arq);
          const extraido = await lerPrintFn({ data: { imagemBase64: b64, mime } });
          const veic = casarVeiculo(extraido.placa, veiculos);
          const mot = casarMotorista(
            { cpf: extraido.motorista_cpf, nome: extraido.motorista_nome, veiculoId: veic?.id },
            motoristas,
          );
          const codCliente = extraido.viagem_cliente.trim().toUpperCase();
          const jaExisteNoBanco = Boolean(
            codCliente && obsRecentes.some((o) => o.includes(`VIAGEM CLIENTE #${codCliente}`)),
          );
          const repetidoNoLote = Boolean(codCliente && viagensClienteVistas.has(codCliente));
          if (codCliente) viagensClienteVistas.add(codCliente);

          novos.push({
            uid: `${Date.now()}-${i}`,
            arquivoNome: arq.name,
            extraido,
            veiculoId: veic?.id ?? "",
            motoristaId: mot?.id ?? "",
            destinos: extraido.destinos,
            duplicada: jaExisteNoBanco || repetidoNoLote,
            lancada: false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Falha ao ler imagem.";
          toast.error(`Erro no print ${arq.name}`, { description: msg });
        }
      }
      if (novos.length) {
        setRascunhos(novos);
        setIndiceAtivo(0);
      }
    } finally {
      setLendo(false);
      setProgresso("");
    }
  };

  const atualizarRascunho = (uid: string, patch: Partial<ViagemRascunho>) => {
    setRascunhos((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  };

  const atualizarDestino = (uid: string, idx: number, patch: Partial<DestinoExtraido>) => {
    setRascunhos((prev) =>
      prev.map((r) =>
        r.uid === uid
          ? { ...r, destinos: r.destinos.map((d, i) => (i === idx ? { ...d, ...patch } : d)) }
          : r,
      ),
    );
  };

  const removerDestino = (uid: string, idx: number) => {
    setRascunhos((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, destinos: r.destinos.filter((_, i) => i !== idx) } : r)),
    );
  };

  const lancarLista = async (alvo: ViagemRascunho[]) => {
    const pendentes = alvo.filter((r) => !r.lancada);
    if (!pendentes.length) return;
    setLancando(true);
    try {
      if (clienteId && typeof window !== "undefined") {
        window.localStorage.setItem(CLIENTE_STORAGE_KEY, clienteId);
      }
      const { data: userData } = await supabase.auth.getUser();
      let criadas = 0;

      for (const r of pendentes) {
        const primeiro = r.destinos[0];
        const obs = r.extraido.viagem_cliente
          ? `VIAGEM CLIENTE #${r.extraido.viagem_cliente.toUpperCase()}`
          : null;

        const { data: novaViagem, error } = await supabase
          .from("viagens")
          .insert({
            cliente_id: clienteId || null,
            motorista_id: r.motoristaId || null,
            veiculo_id: r.veiculoId || null,
            destino_cidade: primeiro?.cidade?.toUpperCase() || null,
            destino_uf: primeiro?.uf?.toUpperCase() || null,
            data_prevista_saida: dataSelecionada.iso,
            status: "planejada",
            observacoes: obs,
            created_by: userData.user?.id,
          })
          .select("id")
          .single();
        if (error) throw error;

        if (r.destinos.length) {
          const paradas = r.destinos.map((d, i) => ({
            viagem_id: novaViagem.id,
            ordem: i + 1,
            cliente: d.destino.trim().toUpperCase() || null,
            endereco: formatarEnderecoParada(d),
            latitude: d.lat ?? null,
            longitude: d.lng ?? null,
          }));
          const { error: erroParadas } = await supabase.from("viagem_paradas").insert(paradas);
          if (erroParadas) throw erroParadas;
        }

        atualizarRascunho(r.uid, { lancada: true });
        criadas++;
      }

      toast.success(criadas === 1 ? "1 viagem lançada!" : `${criadas} viagens lançadas!`);
      onImported();
      const todasLancadas = rascunhos.every((r) => r.lancada || pendentes.some((p) => p.uid === r.uid));
      if (todasLancadas) {
        resetar();
        onOpenChange(false);
      }
    } catch (err) {
      toast.error("Erro ao lançar viagens", { description: err instanceof Error ? err.message : "Tente novamente." });
    } finally {
      setLancando(false);
    }
  };

  const ativo = rascunhos[indiceAtivo];
  const pendentesCount = rascunhos.filter((r) => !r.lancada).length;

  return (
    <Dialog open={open} onOpenChange={handleFechar}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar viagens por print</DialogTitle>
        </DialogHeader>

        {rascunhos.length === 0 ? (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center transition hover:border-brand/60 hover:bg-muted/30"
            >
              <ImagePlus className="size-8 text-brand" />
              <p className="text-sm font-medium">Clique para selecionar os prints do agendamento</p>
              <p className="text-xs text-muted-foreground">Você pode subir vários prints de uma vez — cada imagem vira uma viagem.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleSelecionarArquivos(e.target.files)}
              />
            </div>

            {arquivos.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{arquivos.length} print(s) selecionado(s)</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {arquivos.map((arq, i) => (
                    <div key={`${arq.name}-${i}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                      <span className="truncate">{arq.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        onClick={() => setArquivos((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => handleFechar(false)} disabled={lendo}>
                Cancelar
              </Button>
              <Button type="button" onClick={lerPrints} disabled={!arquivos.length || lendo}>
                {lendo ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
                {lendo ? progresso || "Lendo prints..." : "Ler prints"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">A data das viagens é para hoje ou amanhã?</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={opcaoData === "hoje" ? "default" : "outline"}
                    onClick={() => setOpcaoData("hoje")}
                    className="flex-1"
                  >
                    Hoje ({dataHoje.dataBr})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={opcaoData === "amanha" ? "default" : "outline"}
                    onClick={() => setOpcaoData("amanha")}
                    className="flex-1"
                  >
                    Amanhã ({dataAmanha.dataBr})
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Cliente (opcional)</Label>
                <Select value={clienteId || "nenhum"} onValueChange={(v) => setClienteId(v === "nenhum" ? "" : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem cliente</SelectItem>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rascunhos.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {rascunhos.map((r, i) => (
                  <Button
                    key={r.uid}
                    type="button"
                    size="sm"
                    variant={i === indiceAtivo ? "default" : "outline"}
                    onClick={() => setIndiceAtivo(i)}
                    className="h-8 text-xs"
                  >
                    {r.lancada && <CheckCircle2 className="mr-1 size-3.5 text-emerald-500" />}
                    {(!r.veiculoId || !r.motoristaId || r.duplicada) && !r.lancada && (
                      <AlertTriangle className="mr-1 size-3.5 text-amber-500" />
                    )}
                    {r.extraido.placa || `Print ${i + 1}`}
                  </Button>
                ))}
              </div>
            )}

            {ativo && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    Preview da viagem {indiceAtivo + 1} de {rascunhos.length}
                    {ativo.extraido.viagem_cliente && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Viagem cliente #{ativo.extraido.viagem_cliente})
                      </span>
                    )}
                  </div>
                  <Badge variant="outline">Data: {dataSelecionada.dataBr}</Badge>
                </div>

                {ativo.duplicada && (
                  <div className="flex items-center gap-2 rounded-md bg-amber-500/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="size-4 shrink-0" />
                    Esta viagem do cliente (#{ativo.extraido.viagem_cliente}) já foi lançada recentemente ou está repetida neste lote.
                  </div>
                )}

                {(!ativo.veiculoId || !ativo.motoristaId) && (
                  <div className="flex items-center gap-2 rounded-md bg-amber-500/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="size-4 shrink-0" />
                    {!ativo.veiculoId && `Placa "${ativo.extraido.placa || "não lida"}" não encontrada no cadastro. `}
                    {!ativo.motoristaId && `Motorista "${ativo.extraido.motorista_nome || "não lido"}" não encontrado no cadastro.`}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Veículo (print: {ativo.extraido.placa || "—"})</Label>
                    <Select
                      value={ativo.veiculoId || "nenhum"}
                      onValueChange={(v) => atualizarRascunho(ativo.uid, { veiculoId: v === "nenhum" ? "" : v })}
                      disabled={ativo.lancada}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione o veículo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Sem veículo</SelectItem>
                        {veiculos.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.placa} {v.modelo ? `— ${v.modelo}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Motorista (print: {ativo.extraido.motorista_nome || "—"})</Label>
                    <Select
                      value={ativo.motoristaId || "nenhum"}
                      onValueChange={(v) => atualizarRascunho(ativo.uid, { motoristaId: v === "nenhum" ? "" : v })}
                      disabled={ativo.lancada}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione o motorista" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">Sem motorista</SelectItem>
                        {motoristas.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Destinos ({ativo.destinos.length}) — confira e edite se necessário</Label>
                  <div className="space-y-2">
                    {ativo.destinos.map((d, idx) => (
                      <div key={idx} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12">
                        <div className="sm:col-span-4">
                          <Input
                            value={d.destino}
                            disabled={ativo.lancada}
                            onChange={(e) => atualizarDestino(ativo.uid, idx, { destino: e.target.value.toUpperCase() })}
                            placeholder="Escola / Cliente"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="sm:col-span-5">
                          <Input
                            value={d.endereco}
                            disabled={ativo.lancada}
                            onChange={(e) => atualizarDestino(ativo.uid, idx, { endereco: e.target.value.toUpperCase() })}
                            placeholder="Endereço"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex items-center gap-1 sm:col-span-3">
                          <Input
                            value={d.bairro}
                            disabled={ativo.lancada}
                            onChange={(e) => atualizarDestino(ativo.uid, idx, { bairro: e.target.value.toUpperCase() })}
                            placeholder="Bairro"
                            className="h-8 text-xs"
                          />
                          {d.endereco_corrigido && (
                            <span title="Número completado pelo Google">
                              <MapPin className="size-4 shrink-0 text-emerald-600" />
                            </span>
                          )}
                          {!ativo.lancada && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0"
                              onClick={() => removerDestino(ativo.uid, idx)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {!ativo.lancada && rascunhos.length > 1 && (
                  <div className="flex justify-end">
                    <Button type="button" size="sm" variant="secondary" disabled={lancando} onClick={() => lancarLista([ativo])}>
                      Confirmar e lançar só esta viagem
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={resetar} disabled={lancando}>
                Enviar outros prints
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => handleFechar(false)} disabled={lancando}>
                  Fechar
                </Button>
                <Button type="button" disabled={lancando || pendentesCount === 0} onClick={() => lancarLista(rascunhos)}>
                  {lancando && <Loader2 className="mr-2 size-4 animate-spin" />}
                  {pendentesCount === 1 ? "Confirmar e lançar viagem" : `Lançar ${pendentesCount} viagens`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}