import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Download, FileText, Loader2, RefreshCw, ShieldAlert, Truck, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import { EmitirCteDialog } from "@/components/fiscal/emitir-cte-dialog";
import { EmitirMdfeDialog } from "@/components/fiscal/emitir-mdfe-dialog";
import { DownloadLoteDialog } from "@/components/fiscal/download-lote";
import {
  baixarDocumentoFiscal,
  cancelarDocumentoFiscal,
  encerrarMdfe,
  sincronizarDocumentoFiscal,
  statusIntegracaoFiscal,
} from "@/lib/fiscal.functions";
import { rotuloStatusFiscal, type DocumentoFiscal, type TipoDocumentoFiscal } from "@/lib/fiscal-tipos";
import { GerarCiotDialog } from "@/components/fiscal/gerar-ciot-dialog";
import { cancelarCiot, encerrarCiot, registrarNumeroCiot } from "@/lib/ciot.functions";
import { rotuloProvedorCiot, rotuloStatusCiot, type Ciot } from "@/lib/ciot-tipos";
import { brl, dt } from "@/lib/export-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmpresasCadastro } from "@/components/fiscal/empresas-cadastro";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/fiscal")({
  head: () => ({
    meta: [
      { title: "Documentos fiscais — G3 Expresso" },
      {
        name: "description",
        content: "Emissão e acompanhamento de CT-e e MDF-e integrados às viagens e fechamentos da G3 Expresso.",
      },
      { property: "og:title", content: "Documentos fiscais — G3 Expresso" },
      { property: "og:description", content: "Emita CT-e e MDF-e a partir das viagens e fechamentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FiscalPage,
});

async function listarDocumentos(tipo: TipoDocumentoFiscal): Promise<DocumentoFiscal[]> {
  const { data, error } = await supabase
    .from("fiscal_documentos")
    .select(
      "*, cliente:clientes(razao_social), viagem:viagens(codigo), veiculo:veiculos(placa), motorista:motoristas(nome)",
    )
    .eq("tipo", tipo)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as DocumentoFiscal[];
}

function FiscalPage() {
  const { role } = useAuth();
  const permitido = role === "administrador" || role === "gestor" || role === "financeiro";

  if (!permitido) {
    return (
      <PageShell icon={FileText} title="Documentos fiscais" subtitle="Acesso restrito">
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Este módulo está disponível apenas para a equipe administrativa e financeira.
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell icon={FileText} title="Documentos fiscais" subtitle="Emissão de CT-e, MDF-e e CIOT">
      <StatusIntegracao />
      <Tabs defaultValue="cte">
        <TabsList>
          <TabsTrigger value="cte">CT-e</TabsTrigger>
          <TabsTrigger value="mdfe">MDF-e</TabsTrigger>
          <TabsTrigger value="ciot">CIOT</TabsTrigger>
          <TabsTrigger value="empresas">
            <Building2 className="mr-1.5 size-4" /> Empresas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="cte" className="pt-3">
          <ListaDocumentos tipo="cte" />
        </TabsContent>
        <TabsContent value="mdfe" className="pt-3">
          <ListaDocumentos tipo="mdfe" />
        </TabsContent>
        <TabsContent value="ciot" className="pt-3">
          <ListaCiots />
        </TabsContent>
        <TabsContent value="empresas" className="pt-3">
          <EmpresasCadastro />
        </TabsContent>
      </Tabs>

    </PageShell>
  );
}

function StatusIntegracao() {
  const status = useServerFn(statusIntegracaoFiscal);
  const { data } = useQuery({ queryKey: ["fiscal-status"], queryFn: () => status({}) });
  if (!data || data.configurado) return null;
  return (
    <Card className="mb-4 flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <div>
        <div className="font-semibold">Integração fiscal ainda não configurada</div>
        <p className="text-muted-foreground">
          As credenciais de acesso ao emissor não estão cadastradas, então a emissão fica indisponível. Você pode
          preparar os documentos, mas o envio só funciona depois que o acesso for liberado — vale tanto para o ambiente
          de teste (homologação) quanto para o de produção.
        </p>
      </div>
    </Card>
  );
}

function ListaDocumentos({ tipo }: { tipo: TipoDocumentoFiscal }) {
  const qc = useQueryClient();
  const [abrirCte, setAbrirCte] = useState(false);
  const [abrirMdfe, setAbrirMdfe] = useState(false);
  const [abrirLote, setAbrirLote] = useState(false);

  const sincronizar = useServerFn(sincronizarDocumentoFiscal);
  const baixar = useServerFn(baixarDocumentoFiscal);
  const cancelar = useServerFn(cancelarDocumentoFiscal);
  const encerrar = useServerFn(encerrarMdfe);

  const { data = [], isLoading } = useQuery({
    queryKey: ["fiscal-documentos", tipo],
    queryFn: () => listarDocumentos(tipo),
  });
  const { data: ctes = [] } = useQuery({
    queryKey: ["fiscal-documentos", "cte"],
    queryFn: () => listarDocumentos("cte"),
    enabled: tipo === "mdfe",
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ["fiscal-documentos"] });

  const acaoSincronizar = useMutation({
    mutationFn: (id: string) => sincronizar({ data: { id } }),
    onSuccess: () => {
      toast.success("Situação atualizada");
      recarregar();
    },
    onError: (e: Error) => toast.error("Não foi possível atualizar", { description: e.message }),
  });

  const acaoBaixar = useMutation({
    mutationFn: (id: string) => baixar({ data: { id } }),
    onSuccess: (r) => {
      const url = (r as { url?: string | null })?.url;
      if (url) window.open(url, "_blank", "noopener");
      else toast.info("O emissor não retornou um arquivo para download deste documento.");
    },
    onError: (e: Error) => toast.error("Não foi possível baixar", { description: e.message }),
  });

  const acaoCancelar = useMutation({
    mutationFn: (v: { id: string; motivo: string }) => cancelar({ data: v }),
    onSuccess: () => {
      toast.success("Cancelamento solicitado");
      recarregar();
    },
    onError: (e: Error) => toast.error("Não foi possível cancelar", { description: e.message }),
  });

  const acaoEncerrar = useMutation({
    mutationFn: (v: { id: string; municipio: string; uf: string }) => encerrar({ data: v }),
    onSuccess: () => {
      toast.success("Encerramento solicitado");
      recarregar();
    },
    onError: (e: Error) => toast.error("Não foi possível encerrar", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {tipo === "cte"
            ? "Conhecimentos de transporte emitidos a partir de viagens, fechamentos ou avulsos."
            : "Manifestos de carga que agrupam CT-es já autorizados."}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={recarregar}>
            <RefreshCw className="mr-2 size-4" /> Atualizar lista
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAbrirLote(true)}>
            <Download className="mr-2 size-4" /> Baixar em lote
          </Button>
          {tipo === "cte" ? (
            <Button size="sm" onClick={() => setAbrirCte(true)}>
              <FileText className="mr-2 size-4" /> Emitir CT-e
            </Button>
          ) : (
            <Button size="sm" onClick={() => setAbrirMdfe(true)}>
              <Truck className="mr-2 size-4" /> Emitir MDF-e
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="grid place-items-center p-10">
            <Loader2 className="size-5 animate-spin text-brand" />
          </div>
        ) : data.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Nenhum documento emitido ainda.</div>
        ) : (
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-muted/40 text-left">
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 font-semibold">Número</th>
                <th className="px-3 py-2 font-semibold">Cliente</th>
                <th className="px-3 py-2 font-semibold">Vínculo</th>
                <th className="px-3 py-2 font-semibold">Chave</th>
                <th className="px-3 py-2 text-right font-semibold">Valor</th>
                <th className="px-3 py-2 font-semibold">Situação</th>
                <th className="px-3 py-2 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} className="border-b border-border/40 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">{dt(d.created_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {d.numero ? `${d.serie ?? ""}/${d.numero}` : "—"}
                    {d.ambiente === "homologacao" && (
                      <Badge variant="outline" className="ml-2 border-amber-500/60 text-[10px] text-amber-600">
                        teste
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">{d.cliente?.razao_social ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {d.viagem?.codigo ? `OS ${d.viagem.codigo}` : d.fechamento_id ? "Fechamento" : "Avulso"}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{d.chave_acesso ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">{brl(Number(d.valor))}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={
                        d.status === "autorizado" || d.status === "encerrado"
                          ? "default"
                          : d.status === "rejeitado"
                            ? "destructive"
                            : "outline"
                      }
                      title={d.motivo ?? undefined}
                    >
                      {rotuloStatusFiscal[d.status]}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Atualizar situação"
                      onClick={() => acaoSincronizar.mutate(d.id)}
                    >
                      <RefreshCw className="size-4" />
                    </Button>
                    {d.status === "autorizado" && (
                      <Button variant="ghost" size="icon" title="Baixar documento" onClick={() => acaoBaixar.mutate(d.id)}>
                        <Download className="size-4" />
                      </Button>
                    )}
                    {d.status === "autorizado" && tipo === "mdfe" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Encerrar manifesto"
                        onClick={() => {
                          const municipio = window.prompt("Município de encerramento:")?.trim();
                          if (!municipio) return;
                          const uf = window.prompt("UF de encerramento:")?.trim();
                          if (!uf) return;
                          acaoEncerrar.mutate({ id: d.id, municipio, uf: uf.toUpperCase() });
                        }}
                      >
                        <Truck className="size-4" />
                      </Button>
                    )}
                    {d.status === "autorizado" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Cancelar documento"
                        onClick={() => {
                          const motivo = window.prompt("Motivo do cancelamento (mínimo 15 caracteres):")?.trim();
                          if (!motivo) return;
                          if (motivo.length < 15) {
                            toast.error("O motivo precisa ter ao menos 15 caracteres.");
                            return;
                          }
                          acaoCancelar.mutate({ id: d.id, motivo });
                        }}
                      >
                        <XCircle className="size-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <DownloadLoteDialog open={abrirLote} onOpenChange={setAbrirLote} />
      <EmitirCteDialog open={abrirCte} onOpenChange={setAbrirCte} onDone={recarregar} />
      <EmitirMdfeDialog open={abrirMdfe} onOpenChange={setAbrirMdfe} ctes={ctes} onDone={recarregar} />
    </div>
  );
}

function ListaCiots() {
  const qc = useQueryClient();
  const [abrir, setAbrir] = useState(false);

  const cancelar = useServerFn(cancelarCiot);
  const encerrar = useServerFn(encerrarCiot);
  const registrar = useServerFn(registrarNumeroCiot);

  const { data = [], isLoading } = useQuery({
    queryKey: ["fiscal-ciots"],
    queryFn: async (): Promise<Ciot[]> => {
      const { data: rows, error } = await supabase
        .from("fiscal_ciots")
        .select(
          "*, cliente:clientes(razao_social), viagem:viagens(codigo), veiculo:veiculos(placa), motorista:motoristas(nome)",
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return (rows ?? []) as unknown as Ciot[];
    },
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ["fiscal-ciots"] });

  const acaoCancelar = useMutation({
    mutationFn: (v: { id: string; motivo: string }) => cancelar({ data: v }),
    onSuccess: () => {
      toast.success("CIOT cancelado");
      recarregar();
    },
    onError: (e: Error) => toast.error("Não foi possível cancelar", { description: e.message }),
  });

  const acaoEncerrar = useMutation({
    mutationFn: (id: string) => encerrar({ data: { id } }),
    onSuccess: () => {
      toast.success("CIOT encerrado");
      recarregar();
    },
    onError: (e: Error) => toast.error("Não foi possível encerrar", { description: e.message }),
  });

  const acaoRegistrar = useMutation({
    mutationFn: (v: { id: string; numero: string }) => registrar({ data: v }),
    onSuccess: () => {
      toast.success("Número do CIOT salvo");
      recarregar();
    },
    onError: (e: Error) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setAbrir(true)}>
          <Truck className="mr-2 size-4" />
          Gerar CIOT
        </Button>
      </div>

      <Card className="overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Carregando...
          </div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum CIOT registrado. Gere pela integração ou lance o número obtido no portal da gestora.
          </div>
        ) : (
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Número</th>
                <th className="p-3">Situação</th>
                <th className="p-3">Origem</th>
                <th className="p-3">Contratado</th>
                <th className="p-3">Viagem</th>
                <th className="p-3">Emissão</th>
                <th className="p-3 text-right">Frete</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="p-3 font-mono">{c.numero_ciot ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant={c.status === "emitido" || c.status === "encerrado" ? "default" : "secondary"}>
                      {rotuloStatusCiot[c.status]}
                    </Badge>
                    {c.motivo && <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">{c.motivo}</p>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{rotuloProvedorCiot[c.provedor]}</td>
                  <td className="p-3">
                    {c.contratado_nome}
                    <span className="block text-xs text-muted-foreground">{c.tipo_contratado}</span>
                  </td>
                  <td className="p-3">
                    {c.viagem?.codigo ?? "—"}
                    <span className="block text-xs text-muted-foreground">{c.veiculo?.placa ?? ""}</span>
                  </td>
                  <td className="p-3">{dt(c.data_emissao)}</td>
                  <td className="p-3 text-right font-mono tabular-nums">{brl(Number(c.valor_frete ?? 0))}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {!c.numero_ciot && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const numero = window.prompt("Número do CIOT:")?.trim();
                            if (numero) acaoRegistrar.mutate({ id: c.id, numero });
                          }}
                        >
                          Lançar número
                        </Button>
                      )}
                      {c.status === "emitido" && (
                        <Button size="sm" variant="outline" onClick={() => acaoEncerrar.mutate(c.id)}>
                          Encerrar
                        </Button>
                      )}
                      {c.status !== "cancelado" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const motivo = window.prompt("Motivo do cancelamento:")?.trim();
                            if (motivo && motivo.length >= 5) acaoCancelar.mutate({ id: c.id, motivo });
                            else if (motivo) toast.error("Descreva o motivo com mais detalhes.");
                          }}
                        >
                          <XCircle className="mr-1 size-4" />
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <GerarCiotDialog open={abrir} onOpenChange={setAbrir} onDone={recarregar} />
    </div>
  );
}

