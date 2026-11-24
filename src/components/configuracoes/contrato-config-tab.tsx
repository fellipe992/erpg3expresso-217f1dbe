import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, FileText, Loader2, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CONTRATO_VERSAO,
  clausulas,
  clausulasPadrao,
  gerarPdfContrato,
  parseModeloContrato,
  type ClausulaContrato,
  type DadosContrato,
} from "@/lib/contrato-motorista";

const DADOS_MODELO: DadosContrato = {
  razao_social: "[RAZÃO SOCIAL DO CONTRATADO]",
  cnpj: "[00.000.000/0001-00]",
  rntrc: "[00000000]",
  motorista_nome: "[NOME DO MOTORISTA]",
  motorista_cpf: "[000.000.000-00]",
  motorista_cnh: "[00000000000]",
  placa: "[ABC1D23]",
  prazo_texto: "fechamento quinzenal com pagamento conforme prazo cadastrado",
};

export function ContratoConfigTab() {
  const { data: company, isLoading } = useCompany();
  const qc = useQueryClient();
  const [modo, setModo] = useState<"ver" | "editar">("ver");
  const [itens, setItens] = useState<ClausulaContrato[]>(() => clausulasPadrao());
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    if (!company) return;
    const salvo = parseModeloContrato((company as { contrato_modelo?: unknown }).contrato_modelo);
    setItens(salvo ?? clausulasPadrao());
  }, [company]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Empresa não carregada");
      const limpo = itens
        .map((c) => ({ titulo: c.titulo.trim(), itens: c.itens.map((t) => t.trim()).filter(Boolean) }))
        .filter((c) => c.titulo && c.itens.length > 0);
      if (limpo.length === 0) throw new Error("Mantenha ao menos uma cláusula no contrato");
      const { error } = await supabase
        .from("company_settings")
        .update({ contrato_modelo: limpo })
        .eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modelo de contrato salvo");
      qc.invalidateQueries({ queryKey: ["company-settings"] });
      setModo("ver");
    },
    onError: (e: Error) => toast.error("Erro ao salvar contrato", { description: e.message }),
  });

  async function baixarModeloPdf() {
    setBaixando(true);
    try {
      const blob = await gerarPdfContrato(DADOS_MODELO, null, null, itens);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `modelo-contrato-agregado-${CONTRATO_VERSAO}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Não foi possível gerar o PDF", { description: (e as Error).message });
    } finally {
      setBaixando(false);
    }
  }

  function restaurarPadrao() {
    setItens(clausulasPadrao());
    toast.info("Modelo padrão restaurado na tela. Clique em Salvar para aplicar.");
  }

  function atualizarTitulo(idx: number, titulo: string) {
    setItens((prev) => prev.map((c, i) => (i === idx ? { ...c, titulo } : c)));
  }

  function atualizarItem(cIdx: number, iIdx: number, texto: string) {
    setItens((prev) =>
      prev.map((c, i) => (i === cIdx ? { ...c, itens: c.itens.map((t, j) => (j === iIdx ? texto : t)) } : c)),
    );
  }

  function adicionarItem(cIdx: number) {
    setItens((prev) => prev.map((c, i) => (i === cIdx ? { ...c, itens: [...c.itens, ""] } : c)));
  }

  function removerItem(cIdx: number, iIdx: number) {
    setItens((prev) =>
      prev.map((c, i) => (i === cIdx ? { ...c, itens: c.itens.filter((_, j) => j !== iIdx) } : c)),
    );
  }

  function adicionarClausula() {
    setItens((prev) => [...prev, { titulo: `${prev.length + 1}. NOVA CLÁUSULA`, itens: [""] }]);
  }

  function removerClausula(cIdx: number) {
    setItens((prev) => prev.filter((_, i) => i !== cIdx));
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const preview = clausulas(DADOS_MODELO, itens);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-brand" />
            <CardTitle>Contrato de Prestação de Serviços (Agregado / TAC)</CardTitle>
            <Badge variant="outline">{CONTRATO_VERSAO}</Badge>
          </div>
          <CardDescription>
            Visualize, edite e baixe o modelo assinado pelos motoristas no aplicativo. Use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{PRAZO_TEXTO}}"}</code> onde deseja inserir o
            prazo de pagamento do motorista.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setModo(modo === "ver" ? "editar" : "ver")}>
            {modo === "ver" ? (
              <>
                <Pencil className="mr-1.5 size-4" /> Editar contrato
              </>
            ) : (
              <>
                <Eye className="mr-1.5 size-4" /> Visualizar
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={baixarModeloPdf} disabled={baixando}>
            {baixando ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}
            Baixar PDF
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {modo === "ver" ? (
          <div className="space-y-4 rounded-lg border bg-muted/20 p-5 text-sm leading-relaxed">
            <div className="border-b pb-3 text-center">
              <p className="font-display text-base font-bold">
                CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE DE CARGAS
              </p>
            </div>
            {preview.map((c) => (
              <div key={c.titulo} className="space-y-1.5">
                <h3 className="font-semibold text-foreground">{c.titulo}</h3>
                {c.itens.map((t, idx) => (
                  <p key={idx} className="text-muted-foreground">
                    {t}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={restaurarPadrao}>
                <RotateCcw className="mr-1.5 size-4" /> Restaurar modelo padrão
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={adicionarClausula}>
                  <Plus className="mr-1.5 size-4" /> Nova cláusula
                </Button>
                <Button type="button" size="sm" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
                  {salvar.isPending ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 size-4" />
                  )}
                  Salvar modelo
                </Button>
              </div>
            </div>

            {itens.map((c, cIdx) => (
              <div key={cIdx} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={c.titulo}
                    onChange={(e) => atualizarTitulo(cIdx, e.target.value)}
                    className="font-semibold"
                    placeholder="Título da cláusula"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removerClausula(cIdx)}
                    title="Remover cláusula"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {c.itens.map((texto, iIdx) => (
                    <div key={iIdx} className="flex items-start gap-2">
                      <Textarea
                        value={texto}
                        onChange={(e) => atualizarItem(cIdx, iIdx, e.target.value)}
                        rows={3}
                        className="text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removerItem(cIdx, iIdx)}
                        title="Remover parágrafo"
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => adicionarItem(cIdx)}>
                  <Plus className="mr-1 size-3.5" /> Adicionar parágrafo
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}