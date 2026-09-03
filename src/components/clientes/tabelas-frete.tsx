import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Table2, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  brl,
  carregarTabela,
  faixaEquivalente,
  garantirTabela,
  listarTipologias,
  precoDe,
  rotuloFaixa,
  nnum,
  type FreteDestino,
} from "@/lib/frete";
import { ImportarFreteBar } from "@/components/clientes/importar-frete";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Botão + modal com as duas tabelas de frete (cliente e motorista) de um cliente. */
export function TabelasFreteButton({
  clienteId,
  clienteNome,
}: {
  clienteId: string;
  clienteNome: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Tabelas de frete">
          <Table2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tabelas de frete — {clienteNome}</DialogTitle>
          <DialogDescription>
            A tabela do cliente define quanto é cobrado. A tabela do motorista define quanto é pago. As duas são
            independentes.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="cliente">
          <TabsList>
            <TabsTrigger value="cliente">Tabela do cliente</TabsTrigger>
            <TabsTrigger value="motorista">Tabela do motorista</TabsTrigger>
          </TabsList>
          <TabsContent value="cliente" className="pt-3">
            <PlanilhaFrete clienteId={clienteId} destino="cliente" />
          </TabsContent>
          <TabsContent value="motorista" className="pt-3">
            <PlanilhaFrete clienteId={clienteId} destino="motorista" />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PlanilhaFrete({ clienteId, destino }: { clienteId: string; destino: FreteDestino }) {
  const qc = useQueryClient();
  const chave = ["frete-tabela", clienteId, destino];

  const { data: tipologias = [] } = useQuery({ queryKey: ["tipologias"], queryFn: listarTipologias });
  const { data, isLoading } = useQuery({ queryKey: chave, queryFn: () => carregarTabela(clienteId, destino) });

  const [raio, setRaio] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [percentual, setPercentual] = useState("");
  const [aplicando, setAplicando] = useState(false);

  const { data: tabelaCliente } = useQuery({
    queryKey: ["frete-tabela", clienteId, "cliente"],
    queryFn: () => carregarTabela(clienteId, "cliente"),
    enabled: destino === "motorista",
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: chave });
  const ativos = tipologias.filter((t) => t.ativo);

  /** Opcional: gera os valores do motorista como um percentual da tabela do cliente. */
  const aplicarPercentual = async () => {
    const pct = nnum(percentual);
    if (pct <= 0) return toast.error("Informe o percentual (ex.: 70).");
    const faixas = data?.faixas ?? [];
    if (!faixas.length) return toast.error("Cadastre primeiro os raios desta tabela.");
    const origem = tabelaCliente;
    if (!origem?.faixas.length) return toast.error("A tabela do cliente ainda não tem valores cadastrados.");

    setAplicando(true);
    try {
      const linhas: { faixa_id: string; tipologia_id: string; valor: number }[] = [];
      for (const f of faixas) {
        const ref = faixaEquivalente(origem.faixas, f);
        if (!ref) continue;
        for (const t of ativos) {
          const base = precoDe(origem.precos, ref.id, t.id);
          if (base == null) continue;
          linhas.push({
            faixa_id: f.id,
            tipologia_id: t.id,
            valor: Math.round(base * (pct / 100) * 100) / 100,
          });
        }
      }
      if (!linhas.length) return toast.error("Nenhum valor equivalente encontrado na tabela do cliente.");
      const { error } = await supabase
        .from("frete_precos")
        .upsert(linhas, { onConflict: "faixa_id,tipologia_id" });
      if (error) throw error;
      toast.success(`${linhas.length} valores gerados com ${pct}% da tabela do cliente.`);
      recarregar();
    } catch (e) {
      toast.error("Não foi possível aplicar o percentual", { description: (e as Error).message });
    } finally {
      setAplicando(false);
    }
  };

  const adicionarFaixa = async () => {
    const texto = raio.trim();
    const numeros = (texto.match(/\d+([.,]\d+)?/g) ?? []).map(nnum);
    if (!numeros.length) return toast.error('Informe o raio. Ex.: "50" ou "51 a 80".');

    const anterior = (data?.faixas ?? []).reduce((m, f) => Math.max(m, f.km_max), 0);
    const min = numeros.length > 1 ? numeros[0]! : anterior;
    const max = numeros.length > 1 ? numeros[1]! : numeros[0]!;
    if (max <= min) return toast.error("O raio informado deve ser maior que o último raio cadastrado.");

    setSalvando(true);
    try {
      const tabelaId = await garantirTabela(clienteId, destino);
      const { error } = await supabase.from("frete_faixas").insert({
        tabela_id: tabelaId,
        km_min: min,
        km_max: max,
        descricao: texto,
        ordem: (data?.faixas.length ?? 0) + 1,
      });
      if (error) throw error;
      setRaio("");
      toast.success("Faixa de raio criada.");
      recarregar();
    } catch (e) {
      toast.error("Não foi possível criar a faixa", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  };

  const excluirFaixa = async (id: string, rotulo: string) => {
    if (!confirm(`Excluir a faixa ${rotulo} e seus preços?`)) return;
    const { error } = await supabase.from("frete_faixas").delete().eq("id", id);
    if (error) return toast.error("Não foi possível excluir a faixa.");
    toast.success("Faixa excluída.");
    recarregar();
  };

  const salvarPreco = async (faixaId: string, tipologiaId: string, valorTexto: string) => {
    const valor = nnum(valorTexto);
    const { error } = await supabase
      .from("frete_precos")
      .upsert({ faixa_id: faixaId, tipologia_id: tipologiaId, valor }, { onConflict: "faixa_id,tipologia_id" });
    if (error) return toast.error("Não foi possível salvar o preço.");
    recarregar();
  };

  if (isLoading) {
    return (
      <div className="grid place-items-center p-10">
        <Loader2 className="size-5 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ImportarFreteBar clienteId={clienteId} destino={destino} onImportado={recarregar} />
      {destino === "motorista" && (
        <Card className="grid gap-3 p-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Percentual sobre a tabela do cliente (opcional)</Label>
            <DecimalInput decimais={2} value={percentual} onChange={setPercentual} placeholder="70" />
            <p className="text-[11px] text-muted-foreground">
              Opcional: preenche os valores dos raios já cadastrados usando este percentual da tabela do cliente. Você
              pode continuar digitando cada valor manualmente.
            </p>
          </div>
          <Button variant="outline" onClick={aplicarPercentual} disabled={aplicando}>
            {aplicando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Aplicar percentual
          </Button>
        </Card>
      )}
      <Card className="grid gap-3 p-3 md:grid-cols-[2fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Raio</Label>
          <Input
            value={raio}
            onChange={(e) => setRaio(e.target.value)}
            placeholder='Ex.: "50" ou "51 a 80"'
          />
          <p className="text-[11px] text-muted-foreground">
            Digite só o raio (ex.: 50, 80, 100) e o sistema continua a partir do último raio cadastrado. Você também
            pode escrever o intervalo completo (ex.: 51 a 80).
          </p>
        </div>
        <Button onClick={adicionarFaixa} disabled={salvando}>
          {salvando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />} Nova faixa
        </Button>
      </Card>

      {data?.faixas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma faixa de raio cadastrada nesta tabela.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-left">
                <th className="px-3 py-2 font-semibold">Raio</th>
                {ativos.map((t) => (
                  <th key={t.id} className="px-3 py-2 font-semibold">
                    {t.nome}
                  </th>
                ))}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.faixas ?? []).map((f) => (
                <tr key={f.id} className="border-b border-border/40 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{rotuloFaixa(f)}</td>
                  {ativos.map((t) => (
                    <td key={t.id} className="px-2 py-1.5">
                      <CelulaPreco
                        valor={precoDe(data?.precos ?? [], f.id, t.id)}
                        onSalvar={(v) => salvarPreco(f.id, t.id, v)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right">
                    <Button variant="ghost" size="icon" onClick={() => excluirFaixa(f.id, rotuloFaixa(f))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Os valores são salvos ao sair do campo. Faixas sobrepostas são recusadas pelo sistema.
      </p>
    </div>
  );
}

function CelulaPreco({ valor, onSalvar }: { valor: number | null; onSalvar: (v: string) => void }) {
  const [texto, setTexto] = useState(valor != null ? String(valor) : "");
  return (
    <DecimalInput
      className="h-9 w-28 text-right font-mono"
      value={texto}
      onChange={setTexto}
      onBlur={() => {
        const atual = valor != null ? String(valor) : "";
        if (texto !== atual) onSalvar(texto);
      }}
      placeholder={valor != null ? brl(valor) : "—"}
    />
  );
}
