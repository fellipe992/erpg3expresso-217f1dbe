import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Loader2, Search, ShieldAlert, ShieldQuestion } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { validarNaSefaz } from "@/lib/fiscal.functions";
import { rotuloStatusFiscal, type StatusDocumentoFiscal } from "@/lib/fiscal-tipos";
import { brl, dt } from "@/lib/export-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Resultado = Awaited<ReturnType<typeof validarNaSefaz>>;

type DocRow = {
  id: string;
  tipo: string;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  status: string;
  valor: number | null;
  created_at: string;
  cliente?: { razao_social: string } | null;
  viagem?: { codigo: string | null } | null;
};

export function ValidarSefaz() {
  const validar = useServerFn(validarNaSefaz);
  const [docId, setDocId] = useState("");
  const [chave, setChave] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { data: docs = [] } = useQuery({
    queryKey: ["fiscal-docs-validar"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fiscal_documentos")
        .select("id, tipo, numero, serie, chave_acesso, status, valor, created_at, cliente:clientes(razao_social), viagem:viagens(codigo)")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data ?? []) as unknown as DocRow[];
    },
  });

  const consultar = useMutation({
    mutationFn: () => validar({ data: { id: docId || undefined, chave: chave || undefined } }),
    onSuccess: (r) => {
      setResultado(r);
      if (r.status === "autorizado") toast.success("Documento autorizado pela SEFAZ");
      else if (r.status === "rejeitado") toast.error("Documento rejeitado pela SEFAZ");
      else toast.info(`Situação atual: ${rotuloStatusFiscal[r.status as StatusDocumentoFiscal] ?? r.status}`);
    },
    onError: (e: Error) => toast.error("Não foi possível consultar", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Documento emitido</Label>
            <Select
              value={docId}
              onValueChange={(v) => {
                setDocId(v);
                setChave("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o CT-e ou MDF-e" />
              </SelectTrigger>
              <SelectContent>
                {docs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.tipo.toUpperCase()} {d.numero ? `nº ${d.numero}` : "(sem número)"} ·{" "}
                    {d.cliente?.razao_social ?? d.viagem?.codigo ?? dt(d.created_at)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ou chave de acesso (44 dígitos)</Label>
            <Input
              inputMode="numeric"
              value={chave}
              maxLength={54}
              placeholder="00000000000000000000000000000000000000000000"
              onChange={(e) => {
                setChave(e.target.value.replace(/\D/g, ""));
                setDocId("");
              }}
            />
          </div>
        </div>

        <Button onClick={() => consultar.mutate()} disabled={consultar.isPending || (!docId && chave.length !== 44)}>
          {consultar.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
          Consultar na SEFAZ
        </Button>
      </Card>

      {resultado && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            {resultado.status === "autorizado" ? (
              <BadgeCheck className="size-5 text-emerald-600" />
            ) : resultado.status === "rejeitado" ? (
              <ShieldAlert className="size-5 text-destructive" />
            ) : (
              <ShieldQuestion className="size-5 text-amber-600" />
            )}
            <span className="text-base font-semibold">
              {resultado.tipo.toUpperCase()} {resultado.numero ? `nº ${resultado.numero}` : ""}
            </span>
            <Badge
              variant="outline"
              className={
                resultado.status === "autorizado"
                  ? "border-emerald-500/60 text-emerald-600"
                  : resultado.status === "rejeitado"
                    ? "border-destructive/60 text-destructive"
                    : "border-amber-500/60 text-amber-600"
              }
            >
              {rotuloStatusFiscal[resultado.status as StatusDocumentoFiscal] ?? resultado.status}
            </Badge>
            {resultado.ambiente === "homologacao" && (
              <Badge variant="outline" className="border-amber-500/60 text-[10px] text-amber-600">
                teste
              </Badge>
            )}
          </div>

          <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Linha rotulo="Situação informada pela SEFAZ" valor={resultado.situacaoSefaz} />
            <Linha rotulo="Código de retorno" valor={resultado.codigoSefaz} />
            <Linha rotulo="Série" valor={resultado.serie} />
            <Linha rotulo="Protocolo" valor={resultado.protocolo} />
            <Linha
              rotulo="Data de autorização"
              valor={resultado.dataAutorizacao ? dt(resultado.dataAutorizacao) : null}
            />
            <Linha rotulo="Valor" valor={brl(resultado.valor)} />
            <div className="sm:col-span-2">
              <Linha rotulo="Chave de acesso" valor={resultado.chave} mono />
            </div>
            {resultado.motivo && (
              <div className="sm:col-span-2">
                <Linha rotulo="Mensagem" valor={resultado.motivo} />
              </div>
            )}
          </div>

          {resultado.consultaFalhou && (
            <p className="text-xs text-amber-600">
              A consulta ao provedor falhou parcialmente — os dados exibidos podem estar incompletos. Tente novamente em
              instantes.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{rotulo}</span>
      <span className={mono ? "break-all font-mono text-xs" : "font-medium"}>{valor || "—"}</span>
    </div>
  );
}
