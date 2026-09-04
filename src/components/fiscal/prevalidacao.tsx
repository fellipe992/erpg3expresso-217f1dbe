import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { prevalidarEmissao } from "@/lib/fiscal.functions";

type Args = {
  tipo: "cte" | "mdfe";
  empresaId?: string | null;
  viagemId?: string | null;
  fechamentoId?: string | null;
  enabled?: boolean;
};

/** Consulta os campos fiscais obrigatórios que ainda faltam. */
export function usePrevalidacao({ tipo, empresaId, viagemId, fechamentoId, enabled = true }: Args) {
  const validar = useServerFn(prevalidarEmissao);
  const q = useQuery({
    queryKey: ["prevalidacao-fiscal", tipo, empresaId ?? "", viagemId ?? "", fechamentoId ?? ""],
    enabled,
    staleTime: 0,
    queryFn: () =>
      validar({
        data: {
          tipo,
          empresaId: empresaId ?? null,
          viagemId: viagemId ?? null,
          fechamentoId: fechamentoId ?? null,
        },
      }),
  });
  return {
    carregando: q.isFetching,
    ok: q.data?.ok ?? false,
    pendencias: q.data?.pendencias ?? [],
    erro: q.error instanceof Error ? q.error.message : null,
    recarregar: q.refetch,
  };
}

export function PrevalidacaoPainel({
  carregando,
  ok,
  pendencias,
  erro,
}: {
  carregando: boolean;
  ok: boolean;
  pendencias: Array<{ rotulo: string; nome: string; faltando: string[] }>;
  erro: string | null;
}) {
  if (carregando) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Conferindo os dados fiscais…
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        Não foi possível conferir os dados: {erro}
      </div>
    );
  }

  if (ok) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Dados fiscais completos — pronto para emitir.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" /> Complete os dados antes de emitir
      </div>
      <ul className="space-y-1 text-sm">
        {pendencias.map((p, i) => (
          <li key={`${p.rotulo}-${i}`}>
            <span className="font-medium">
              {p.rotulo}
              {p.nome && p.nome !== "—" ? ` (${p.nome})` : ""}:
            </span>{" "}
            <span className="text-muted-foreground">falta {p.faltando.join(", ")}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        A emissão fica bloqueada até esses campos serem preenchidos, para evitar rejeição da SEFAZ.
      </p>
    </div>
  );
}
