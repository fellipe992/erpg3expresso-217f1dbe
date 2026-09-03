import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Users } from "lucide-react";
import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";
import {
  carregarTabela,
  garantirTabela,
  listarTipologias,
  nnum,
  rotuloFaixa,
  type FreteDestino,
  type Tipologia,
} from "@/lib/frete";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LinhaImport = {
  descricao: string;
  km_min: number;
  km_max: number;
  valores: Record<string, number>; // tipologia_id -> valor
};

const ativas = (t: Tipologia[]) => t.filter((x) => x.ativo);

/** Grava faixas + preços na tabela do cliente/motorista, substituindo o conteúdo atual. */
async function gravarTabela(clienteId: string, destino: FreteDestino, linhas: LinhaImport[]) {
  const tabelaId = await garantirTabela(clienteId, destino);

  const atual = await supabase.from("frete_faixas").select("id").eq("tabela_id", tabelaId);
  if (atual.error) throw atual.error;
  if (atual.data?.length) {
    const del = await supabase.from("frete_faixas").delete().eq("tabela_id", tabelaId);
    if (del.error) throw del.error;
  }

  const ins = await supabase
    .from("frete_faixas")
    .insert(
      linhas.map((l, i) => ({
        tabela_id: tabelaId,
        km_min: l.km_min,
        km_max: l.km_max,
        descricao: l.descricao,
        ordem: i + 1,
      })),
    )
    .select("id, km_min, km_max");
  if (ins.error) throw ins.error;

  const criadas = ins.data ?? [];
  const precos: { faixa_id: string; tipologia_id: string; valor: number }[] = [];
  linhas.forEach((l) => {
    const f = criadas.find((c) => Number(c.km_min) === l.km_min && Number(c.km_max) === l.km_max);
    if (!f) return;
    Object.entries(l.valores).forEach(([tipologia_id, valor]) => {
      if (valor > 0) precos.push({ faixa_id: f.id, tipologia_id, valor });
    });
  });
  if (precos.length) {
    const pr = await supabase.from("frete_precos").upsert(precos, { onConflict: "faixa_id,tipologia_id" });
    if (pr.error) throw pr.error;
  }
  return { faixas: criadas.length, precos: precos.length };
}

/** Interpreta o texto do raio: "51 a 80", "80", "0-50". */
function interpretarRaio(texto: string, anterior: number) {
  const nums = (texto.match(/\d+([.,]\d+)?/g) ?? []).map(nnum);
  if (!nums.length) return null;
  const min = nums.length > 1 ? nums[0]! : anterior;
  const max = nums.length > 1 ? nums[1]! : nums[0]!;
  if (max <= min) return null;
  return { min, max };
}

export function ImportarFreteBar({
  clienteId,
  destino,
  onImportado,
}: {
  clienteId: string;
  destino: FreteDestino;
  onImportado: () => void;
}) {
  const qc = useQueryClient();
  const { data: tipologias = [] } = useQuery({ queryKey: ["tipologias"], queryFn: listarTipologias });
  const cols = ativas(tipologias);

  const [openCliente, setOpenCliente] = useState(false);
  const [origemId, setOrigemId] = useState("");
  const [origemDestino, setOrigemDestino] = useState<FreteDestino>(destino);
  const [copiando, setCopiando] = useState(false);
  const [importando, setImportando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-frete-origem"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia")
        .order("razao_social");
      if (error) throw error;
      return data ?? [];
    },
    enabled: openCliente,
  });

  const finalizar = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["frete-tabela", clienteId] });
    onImportado();
  };

  const copiarDeCliente = async () => {
    if (!origemId) return toast.error("Selecione o cliente de origem.");
    if (origemId === clienteId && origemDestino === destino)
      return toast.error("Selecione uma tabela diferente da atual.");
    setCopiando(true);
    try {
      const origem = await carregarTabela(origemId, origemDestino);
      if (!origem.faixas.length) return toast.error("A tabela escolhida não tem faixas cadastradas.");
      const linhas: LinhaImport[] = origem.faixas.map((f) => ({
        descricao: f.descricao ?? rotuloFaixa(f),
        km_min: f.km_min,
        km_max: f.km_max,
        valores: Object.fromEntries(
          origem.precos.filter((p) => p.faixa_id === f.id).map((p) => [p.tipologia_id, p.valor]),
        ),
      }));
      const r = await gravarTabela(clienteId, destino, linhas);
      setOpenCliente(false);
      finalizar(`Tabela importada: ${r.faixas} faixas e ${r.precos} valores.`);
    } catch (e) {
      toast.error("Não foi possível importar a tabela", { description: (e as Error).message });
    } finally {
      setCopiando(false);
    }
  };

  const baixarModelo = () => {
    const cab = ["Raio", ...cols.map((t) => t.nome)];
    const exemplo = [
      ["0 a 50", ...cols.map(() => 350)],
      ["51 a 80", ...cols.map(() => 480)],
      ["81 a 120", ...cols.map(() => 620)],
    ];
    const ws = XLSX.utils.aoa_to_sheet([cab, ...exemplo]);
    ws["!cols"] = cab.map(() => ({ wch: 18 }));
    const instr = XLSX.utils.aoa_to_sheet([
      ["Como preencher a tabela de frete"],
      [""],
      ["1. Na aba 'Tabela', a coluna 'Raio' aceita o intervalo (ex.: 51 a 80) ou apenas o limite (ex.: 80)."],
      ["2. As demais colunas são as tipologias de veículo. Não altere os nomes do cabeçalho."],
      ["3. Use valores numéricos em reais. Vírgula ou ponto como decimal, sem 'R$'."],
      ["4. Deixe em branco onde não houver preço."],
      ["5. A importação substitui a tabela atual deste cliente."],
      [""],
      ["Tipologias reconhecidas:"],
      ...cols.map((t) => [t.nome]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tabela");
    XLSX.utils.book_append_sheet(wb, instr, "Instruções");
    XLSX.writeFile(wb, "modelo-tabela-frete.xlsx");
  };

  const importarExcel = async (file: File) => {
    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const nome = wb.SheetNames.find((n) => n.toLowerCase().startsWith("tabela")) ?? wb.SheetNames[0]!;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome]!, { header: 1, blankrows: false });
      if (rows.length < 2) throw new Error("A planilha está vazia.");

      const cab = (rows[0] as unknown[]).map((c) => String(c ?? "").trim());
      const mapa = cab.map((titulo, i) => {
        if (i === 0) return null;
        const chave = titulo.toLowerCase();
        const t = cols.find((x) => x.nome.toLowerCase() === chave || x.codigo.toLowerCase() === chave);
        return t ? { idx: i, id: t.id } : null;
      });
      const validas = mapa.filter((m): m is { idx: number; id: string } => !!m);
      if (!validas.length)
        throw new Error("Nenhuma coluna de tipologia reconhecida. Baixe o arquivo de referência e mantenha o cabeçalho.");

      const linhas: LinhaImport[] = [];
      let anterior = 0;
      for (const bruta of rows.slice(1)) {
        const linha = bruta as unknown[];
        const texto = String(linha[0] ?? "").trim();
        if (!texto) continue;
        const faixa = interpretarRaio(texto, anterior);
        if (!faixa) continue;
        anterior = faixa.max;
        const valores: Record<string, number> = {};
        validas.forEach(({ idx, id }) => {
          const v = nnum(linha[idx]);
          if (v > 0) valores[id] = Math.round(v * 100) / 100;
        });
        linhas.push({ descricao: texto, km_min: faixa.min, km_max: faixa.max, valores });
      }
      if (!linhas.length) throw new Error("Nenhuma faixa de raio válida encontrada na planilha.");

      const r = await gravarTabela(clienteId, destino, linhas);
      finalizar(`Planilha importada: ${r.faixas} faixas e ${r.precos} valores.`);
    } catch (e) {
      toast.error("Não foi possível importar a planilha", { description: (e as Error).message });
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card className="flex flex-wrap items-center gap-2 p-3">
      <Button variant="outline" size="sm" onClick={() => setOpenCliente(true)}>
        <Users className="mr-1.5 size-4" /> Importar de outro cliente
      </Button>
      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={importando}>
        {importando ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="mr-1.5 size-4" />
        )}
        Importar do Excel
      </Button>
      <Button variant="ghost" size="sm" onClick={baixarModelo}>
        <Download className="mr-1.5 size-4" /> Baixar modelo
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importarExcel(f);
        }}
      />
      <span className="text-[11px] text-muted-foreground">
        A importação substitui as faixas e valores desta tabela.
      </span>

      <Dialog open={openCliente} onOpenChange={setOpenCliente}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar tabela de outro cliente</DialogTitle>
            <DialogDescription>
              Copia as faixas de raio e os valores para a tabela atual. A tabela atual será substituída.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cliente de origem</Label>
              <Select value={origemId} onValueChange={setOrigemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome_fantasia || c.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Qual tabela copiar</Label>
              <Select value={origemDestino} onValueChange={(v) => setOrigemDestino(v as FreteDestino)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Tabela do cliente</SelectItem>
                  <SelectItem value="motorista">Tabela do motorista</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCliente(false)}>
              Cancelar
            </Button>
            <Button onClick={copiarDeCliente} disabled={copiando}>
              {copiando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null} Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
