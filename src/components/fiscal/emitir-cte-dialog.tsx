import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { emitirCte } from "@/lib/fiscal.functions";
import type { AdicionalFrete, AmbienteFiscal, AtividadeTomador, EnvolvidoFiscal } from "@/lib/fiscal-tipos";
import { rotuloAmbiente } from "@/lib/fiscal-tipos";
import { PrevalidacaoPainel, usePrevalidacao } from "@/components/fiscal/prevalidacao";
import { EnvolvidoForm, envolvidoVazio } from "@/components/fiscal/envolvido-form";
import { nnum } from "@/lib/frete";
import { brl, dt } from "@/lib/export-utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DecimalInput } from "@/components/ui/decimal-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Origem = "avulso" | "viagem" | "fechamento";

const atividades: { valor: AtividadeTomador; rotulo: string }[] = [
  { valor: "SERVICO", rotulo: "Serviço" },
  { valor: "COMERCIO", rotulo: "Comércio" },
  { valor: "INDUSTRIA", rotulo: "Indústria" },
  { valor: "TRANSPORTE", rotulo: "Transporte" },
  { valor: "PRODUTORRURAL", rotulo: "Produtor rural" },
  { valor: "NAO_CONTRIBUINTE", rotulo: "Não contribuinte" },
  { valor: "OUTROS", rotulo: "Outros" },
];

type ClienteRow = {
  id: string;
  razao_social: string;
  cnpj_cpf: string | null;
  inscricao_estadual: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  endereco_numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

const doCliente = (c: ClienteRow | undefined | null): EnvolvidoFiscal =>
  c
    ? {
        nome: c.razao_social,
        inscricaoFederal: c.cnpj_cpf ?? "",
        inscricaoEstadual: c.inscricao_estadual ?? "",
        telefone: c.telefone ?? "",
        email: c.email ?? "",
        endereco: {
          logradouro: c.endereco ?? "",
          numero: c.endereco_numero ?? "",
          bairro: c.bairro ?? "",
          municipio: c.cidade ?? "",
          uf: c.uf ?? "",
          cep: c.cep ?? "",
        },
      }
    : envolvidoVazio();

export function EmitirCteDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const emitir = useServerFn(emitirCte);
  const [origem, setOrigem] = useState<Origem>("viagem");
  const [viagemId, setViagemId] = useState("");
  const [fechamentoId, setFechamentoId] = useState("");
  const [clienteId, setClienteId] = useState("");

  const [remetente, setRemetente] = useState<EnvolvidoFiscal>(envolvidoVazio());
  const [destinatario, setDestinatario] = useState<EnvolvidoFiscal>(envolvidoVazio());
  const [tomador, setTomador] = useState<EnvolvidoFiscal>(envolvidoVazio());
  const [atividade, setAtividade] = useState<AtividadeTomador>("SERVICO");

  const [frete, setFrete] = useState("");
  const [pedagio, setPedagio] = useState("");
  const [adicionais, setAdicionais] = useState<AdicionalFrete[]>([]);
  const [novoAdic, setNovoAdic] = useState({ nome: "", valor: "" });
  const [cargaValor, setCargaValor] = useState("");
  const [produto, setProduto] = useState("Carga geral");
  const [peso, setPeso] = useState("");
  const [chaves, setChaves] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviarEmail, setEnviarEmail] = useState(true);

  const [empresaId, setEmpresaId] = useState("");
  const [ambiente, setAmbiente] = useState<AmbienteFiscal>("producao");

  const { data: empresas = [] } = useQuery({
    queryKey: ["company-settings-emitentes"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("*")
        .eq("emitente_fiscal", true)
        .eq("ativo", true)
        .order("emitente_padrao", { ascending: false })
        .order("created_at", { ascending: true });
      return (data ?? []) as Array<Record<string, string | boolean | null>>;
    },
  });

  const empresa = useMemo(
    () => empresas.find((e) => String(e["id"]) === empresaId) ?? empresas[0] ?? null,
    [empresas, empresaId],
  );

  // Seleciona a empresa padrão de emissão ao abrir.
  useEffect(() => {
    if (open && !empresaId && empresas.length) setEmpresaId(String(empresas[0]!["id"]));
  }, [open, empresaId, empresas]);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-fiscal"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("clientes")
        .select(
          "id, razao_social, cnpj_cpf, inscricao_estadual, telefone, email, endereco, endereco_numero, bairro, cidade, uf, cep",
        )
        .eq("ativo", true)
        .order("razao_social");
      return (data ?? []) as ClienteRow[];
    },
  });

  const { data: viagens = [] } = useQuery({
    queryKey: ["viagens-fiscal"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("viagens")
        .select(
          "id, codigo, cliente_id, veiculo_id, motorista_id, origem_cidade, origem_uf, destino_cidade, destino_uf, data_chegada, valor_frete, pedagio_cliente",
        )
        .eq("status", "concluida")
        .order("data_chegada", { ascending: false })
        .limit(200);
      return (data ?? []) as Array<Record<string, string | number | null>>;
    },
  });

  const { data: fechamentos = [] } = useQuery({
    queryKey: ["fechamentos-fiscal"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("fechamentos")
        .select("id, numero, cliente_id, periodo_inicio, periodo_fim, valor, status, tipo")
        .eq("tipo", "cliente")
        .neq("status", "cancelado")
        .order("numero", { ascending: false })
        .limit(100);
      return (data ?? []) as Array<Record<string, string | number | null>>;
    },
  });

  const empresaEnvolvido = useMemo<EnvolvidoFiscal>(
    () => ({
      nome: String(empresa?.["razao_social"] || empresa?.["nome_fantasia"] || ""),
      inscricaoFederal: String(empresa?.["cnpj"] ?? ""),
      inscricaoEstadual: String(empresa?.["inscricao_estadual"] ?? ""),
      telefone: String(empresa?.["telefone"] ?? ""),
      email: String(empresa?.["email"] ?? ""),
      endereco: {
        logradouro: String(empresa?.["endereco"] ?? ""),
        numero: String(empresa?.["endereco_numero"] ?? ""),
        bairro: String(empresa?.["bairro"] ?? ""),
        municipio: String(empresa?.["cidade"] ?? ""),
        uf: String(empresa?.["uf"] ?? ""),
        cep: String(empresa?.["cep"] ?? ""),
      },
    }),
    [empresa],
  );

  // Pré-preenche remetente com a empresa emitente escolhida.
  useEffect(() => {
    if (open && empresa) setRemetente(empresaEnvolvido);
  }, [open, empresa, empresaEnvolvido]);

  // Ao escolher o cliente, preenche destinatário e tomador.
  useEffect(() => {
    if (!clienteId) return;
    const c = clientes.find((x) => x.id === clienteId);
    setDestinatario(doCliente(c));
    setTomador(doCliente(c));
  }, [clienteId, clientes]);

  // Origem viagem: puxa cliente e valores apurados.
  useEffect(() => {
    if (origem !== "viagem" || !viagemId) return;
    const v = viagens.find((x) => String(x["id"]) === viagemId);
    if (!v) return;
    if (v["cliente_id"]) setClienteId(String(v["cliente_id"]));
    setFrete(String(Number(v["valor_frete"] ?? 0)).replace(".", ","));
    setPedagio(String(Number(v["pedagio_cliente"] ?? 0)).replace(".", ","));
  }, [origem, viagemId, viagens]);

  // Origem fechamento: cliente e valor consolidado.
  useEffect(() => {
    if (origem !== "fechamento" || !fechamentoId) return;
    const f = fechamentos.find((x) => String(x["id"]) === fechamentoId);
    if (!f) return;
    if (f["cliente_id"]) setClienteId(String(f["cliente_id"]));
    setFrete(String(Number(f["valor"] ?? 0)).replace(".", ","));
    setPedagio("");
  }, [origem, fechamentoId, fechamentos]);

  const pre = usePrevalidacao({
    tipo: "cte",
    empresaId,
    viagemId: origem === "viagem" ? viagemId : null,
    fechamentoId: origem === "fechamento" ? fechamentoId : null,
    enabled: open,
  });

  const totalFrete = nnum(frete) + nnum(pedagio) + adicionais.reduce((s, a) => s + a.valor, 0);

  const salvar = useMutation({
    mutationFn: () =>
      emitir({
        data: {
          empresaId: empresaId || null,
          ambiente,
          remetente,
          destinatario,
          tomador,
          atividadeTomador: atividade,
          freteValor: nnum(frete),
          pedagio: nnum(pedagio),
          adicionais,
          cargaValor: nnum(cargaValor) || totalFrete,
          produtoPredominante: produto,
          pesoKg: nnum(peso),
          chavesNfe: chaves
            .split(/[\s,;]+/)
            .map((c) => c.trim())
            .filter(Boolean),
          observacao,
          enviarEmail,
          clienteId: clienteId || null,
          viagemId: origem === "viagem" ? viagemId || null : null,
          fechamentoId: origem === "fechamento" ? fechamentoId || null : null,
        },
      }),
    onSuccess: () => {
      toast.success("CT-e enviado para autorização", {
        description: "Use o botão de atualizar na lista para acompanhar o retorno da SEFAZ.",
      });
      onDone();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Não foi possível emitir o CT-e", { description: e.message }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emitir CT-e</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Empresa emitente</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger><SelectValue placeholder="Selecione a empresa emitente" /></SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={String(e["id"])} value={String(e["id"])}>
                    {String(e["nome_fantasia"] ?? e["razao_social"] ?? "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!empresas.length && (
              <p className="text-xs text-amber-600">
                Nenhuma empresa marcada como emitente. Cadastre em Empresa e ative "Emite CT-e e MDF-e".
              </p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Ambiente de emissão</Label>
              <Select value={ambiente} onValueChange={(v) => setAmbiente(v as AmbienteFiscal)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="producao">{rotuloAmbiente.producao}</SelectItem>
                  <SelectItem value="homologacao">{rotuloAmbiente.homologacao}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ambiente === "homologacao"
                  ? "Documento de teste: não tem valor fiscal."
                  : "Documento oficial: vale na SEFAZ."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Base do documento</Label>
              <Select value={origem} onValueChange={(v) => setOrigem(v as Origem)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="viagem">Viagem concluída</SelectItem>
                  <SelectItem value="fechamento">Fechamento do cliente</SelectItem>
                  <SelectItem value="avulso">Avulso</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {origem === "viagem" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Viagem</Label>
                <Select value={viagemId} onValueChange={setViagemId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {viagens.map((v) => (
                      <SelectItem key={String(v["id"])} value={String(v["id"])}>
                        {(v["codigo"] as string) ?? "—"} · {v["origem_cidade"]}/{v["origem_uf"]} →{" "}
                        {v["destino_cidade"]}/{v["destino_uf"]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {origem === "fechamento" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Fechamento</Label>
                <Select value={fechamentoId} onValueChange={setFechamentoId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {fechamentos.map((f) => (
                      <SelectItem key={String(f["id"])} value={String(f["id"])}>
                        #{f["numero"]} · {dt(String(f["periodo_inicio"]))} a {dt(String(f["periodo_fim"]))} ·{" "}
                        {brl(Number(f["valor"] ?? 0))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Cliente</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Atividade do tomador</Label>
              <Select value={atividade} onValueChange={(v) => setAtividade(v as AtividadeTomador)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {atividades.map((a) => (
                    <SelectItem key={a.valor} value={a.valor}>{a.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <EnvolvidoForm titulo="Remetente" valor={remetente} onChange={setRemetente} />
          <EnvolvidoForm titulo="Destinatário" valor={destinatario} onChange={setDestinatario} />
          <EnvolvidoForm titulo="Tomador do serviço" valor={tomador} onChange={setTomador} />

          <div className="grid gap-3 rounded-lg border border-border/60 p-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor do frete</Label>
              <DecimalInput value={frete} onChange={setFrete} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Pedágio</Label>
              <DecimalInput value={pedagio} onChange={setPedagio} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor da carga</Label>
              <DecimalInput value={cargaValor} onChange={setCargaValor} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Peso bruto (kg)</Label>
              <DecimalInput value={peso} onChange={setPeso} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Produto predominante</Label>
              <Input value={produto} onChange={(e) => setProduto(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Chaves das notas fiscais (44 dígitos, uma por linha)</Label>
              <Textarea rows={2} value={chaves} onChange={(e) => setChaves(e.target.value)} />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs">Componentes adicionais</Label>
              {adicionais.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{a.nome}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums">{brl(a.valor)}</span>
                    <Button variant="ghost" size="icon" onClick={() => setAdicionais(adicionais.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                </div>
              ))}
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                <Input
                  value={novoAdic.nome}
                  onChange={(e) => setNovoAdic({ ...novoAdic, nome: e.target.value })}
                  placeholder="Ex.: Taxa de descarga"
                />
                <DecimalInput
                  value={novoAdic.valor}
                  onChange={(v) => setNovoAdic({ ...novoAdic, valor: v })}
                  placeholder="0,00"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!novoAdic.nome.trim() || nnum(novoAdic.valor) <= 0) {
                      return toast.error("Informe descrição e valor do adicional.");
                    }
                    setAdicionais([...adicionais, { nome: novoAdic.nome.trim(), valor: nnum(novoAdic.valor) }]);
                    setNovoAdic({ nome: "", valor: "" });
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Observações do documento</Label>
              <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={enviarEmail} onCheckedChange={(v) => setEnviarEmail(!!v)} />
              Enviar o documento por e-mail ao tomador
            </label>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3 text-sm font-semibold">
            <span>Total do CT-e</span>
            <span className="font-mono tabular-nums">{brl(totalFrete)}</span>
          </div>
        </div>

        <PrevalidacaoPainel carregando={pre.carregando} ok={pre.ok} pendencias={pre.pendencias} erro={pre.erro} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || pre.carregando || !pre.ok}>
            {salvar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Emitir CT-e
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
