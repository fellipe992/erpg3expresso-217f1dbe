import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useEffect } from "react";

export type PlanoContaSelection = {
  grupoId: string | null;
  subgrupoId: string | null;
  contaId: string | null;
};

type Grupo = { id: string; codigo: string; nome: string; tipo: "receita" | "despesa" | "outros"; ativo: boolean };
type Subgrupo = { id: string; grupo_id: string; codigo: string; nome: string; ativo: boolean };
type Conta = { id: string; subgrupo_id: string; codigo: string; nome: string; tipo: "receita" | "despesa" | "outros"; centro_custo: string | null; ativo: boolean };

export function PlanoContaSelector({
  value,
  onChange,
  filterTipo,
  required,
}: {
  value: PlanoContaSelection;
  onChange: (v: PlanoContaSelection) => void;
  filterTipo?: "receita" | "despesa";
  required?: boolean;
}) {
  const { data: grupos = [] } = useQuery({
    queryKey: ["plano-grupos-lite", filterTipo],
    queryFn: async () => {
      let q = supabase.from("plano_grupos").select("id, codigo, nome, tipo, ativo").eq("ativo", true).order("ordem");
      if (filterTipo) q = q.in("tipo", filterTipo === "receita" ? ["receita"] : ["despesa", "outros"]);
      const { data } = await q;
      return (data ?? []) as Grupo[];
    },
  });

  const { data: subgrupos = [] } = useQuery({
    queryKey: ["plano-subgrupos-by-grupo", value.grupoId],
    enabled: !!value.grupoId,
    queryFn: async () => {
      const { data } = await supabase.from("plano_subgrupos").select("id, grupo_id, codigo, nome, ativo").eq("grupo_id", value.grupoId!).eq("ativo", true).order("ordem");
      return (data ?? []) as Subgrupo[];
    },
  });

  const { data: contas = [] } = useQuery({
    queryKey: ["plano-contas-by-sub", value.subgrupoId],
    enabled: !!value.subgrupoId,
    queryFn: async () => {
      const { data } = await supabase.from("plano_contas").select("id, subgrupo_id, codigo, nome, tipo, centro_custo, ativo").eq("subgrupo_id", value.subgrupoId!).eq("ativo", true).order("codigo");
      return (data ?? []) as Conta[];
    },
  });

  // Se conta selecionada, resolve grupo/subgrupo automaticamente na primeira montagem
  const contaSel = useMemo(() => contas.find((c) => c.id === value.contaId) ?? null, [contas, value.contaId]);
  useEffect(() => {
    if (value.contaId && !value.subgrupoId) {
      // busca hierarquia
      (async () => {
        const { data } = await supabase
          .from("plano_contas")
          .select("id, subgrupo_id, plano_subgrupos!inner(id, grupo_id)")
          .eq("id", value.contaId!)
          .maybeSingle();
        const sub = (data as { subgrupo_id: string; plano_subgrupos: { grupo_id: string } } | null);
        if (sub) onChange({ grupoId: sub.plano_subgrupos.grupo_id, subgrupoId: sub.subgrupo_id, contaId: value.contaId });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.contaId]);

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Grupo {required && "*"}</Label>
        <Select
          value={value.grupoId ?? "__none"}
          onValueChange={(v) => onChange({ grupoId: v === "__none" ? null : v, subgrupoId: null, contaId: null })}
        >
          <SelectTrigger><SelectValue placeholder="Selecione o grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.codigo} · {g.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Subgrupo {required && "*"}</Label>
        <Select
          value={value.subgrupoId ?? "__none"}
          onValueChange={(v) => onChange({ grupoId: value.grupoId, subgrupoId: v === "__none" ? null : v, contaId: null })}
          disabled={!value.grupoId}
        >
          <SelectTrigger><SelectValue placeholder={value.grupoId ? "Selecione o subgrupo" : "Escolha o grupo"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {subgrupos.map((s) => <SelectItem key={s.id} value={s.id}>{s.codigo} · {s.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Conta financeira {required && "*"}</Label>
        <Select
          value={value.contaId ?? "__none"}
          onValueChange={(v) => onChange({ grupoId: value.grupoId, subgrupoId: value.subgrupoId, contaId: v === "__none" ? null : v })}
          disabled={!value.subgrupoId}
        >
          <SelectTrigger><SelectValue placeholder={value.subgrupoId ? "Selecione a conta" : "Escolha o subgrupo"} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo} · {c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        {contaSel?.centro_custo && (
          <p className="text-[10px] text-muted-foreground">Centro de custo: {contaSel.centro_custo}</p>
        )}
      </div>
    </div>
  );
}
