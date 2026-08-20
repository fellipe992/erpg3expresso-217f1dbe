import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, FilterX } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BiDados, LancBi } from "@/hooks/use-bi-dados";

export type FiltrosFin = {
  de: string;
  ate: string;
  empresaId: string;
  /** Vazio = todos. Suporta múltipla seleção. */
  clienteIds: string[];
  veiculoIds: string[];
  motoristaIds: string[];
  status: string;
  busca: string;
};

export const STATUS_OPCOES: { value: string; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "pago", label: "Pago / Recebido" },
  { value: "pendente", label: "Pendente" },
  { value: "a_vencer", label: "A vencer" },
  { value: "atrasado", label: "Em atraso" },
];

/** Data de hoje no calendário da operação (nunca em UTC, que "vira o dia" às 21h). */
export const hojeLocal = () => diaLocal(new Date().toISOString());

export function filtrosIniciais(diasAtras = 90): FiltrosFin {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - diasAtras);
  return {
    de: diaLocal(inicio.toISOString()),
    ate: hojeLocal(),
    empresaId: "todas",
    clienteIds: [],
    veiculoIds: [],
    motoristaIds: [],
    status: "todos",
    busca: "",
  };
}

/** Seleção múltipla: lista vazia = sem restrição. */
export const selecionado = (ids: string[], valor: string | null | undefined) =>
  ids.length === 0 || (!!valor && ids.includes(valor));

/** Rótulo legível da seleção, para cabeçalhos de PDF/Excel. */
export const rotuloSelecao = (ids: string[], nome: (id: string) => string, todos = "Todos") =>
  ids.length === 0 ? todos : ids.map((id) => nome(id)).join(", ");

/** Regra única de status usada por todos os relatórios e telas financeiras. */
export function statusCombina(l: Pick<LancBi, "status" | "data_vencimento">, filtro: string) {
  if (filtro === "todos") return true;
  const hoje = new Date().toISOString().slice(0, 10);
  if (filtro === "a_vencer") return l.status === "pendente" && !!l.data_vencimento && l.data_vencimento >= hoje;
  return l.status === filtro;
}

export function useEmpresas() {
  return useQuery({
    queryKey: ["empresas-lite"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("id, nome_fantasia, razao_social");
      return ((data ?? []) as { id: string; nome_fantasia: string | null; razao_social: string | null }[]).map((e) => ({
        id: e.id,
        nome: e.nome_fantasia || e.razao_social || "Empresa",
      }));
    },
  });
}

export function MultiSelect({
  opcoes,
  value,
  onChange,
  placeholder,
  vazioLabel = "Todos",
}: {
  opcoes: { id: string; nome: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  vazioLabel?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? opcoes.filter((o) => o.nome.toLowerCase().includes(t)) : opcoes;
  }, [opcoes, q]);

  const alternar = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  const resumo =
    value.length === 0
      ? vazioLabel
      : value.length === 1
        ? opcoes.find((o) => o.id === value[0])?.nome ?? "1 selecionado"
        : `${value.length} selecionados`;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
          <span className="truncate">{resumo}</span>
          <span className="flex items-center gap-1">
            {value.length > 1 && <Badge variant="secondary" className="px-1 text-[10px]">{value.length}</Badge>}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2" align="start">
        <Input
          className="mb-2 h-8"
          placeholder={placeholder ?? "Buscar…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div
          className="max-h-64 overflow-y-auto overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
        >
          <div className="space-y-0.5 pr-1">
            {filtradas.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhum resultado.</p>
            )}
            {filtradas.map((o) => {
              const ativo = value.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => alternar(o.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                    ativo && "bg-accent/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border",
                      ativo ? "border-brand bg-brand text-brand-foreground" : "border-muted-foreground/40",
                    )}
                  >
                    {ativo && <Check className="size-3" />}
                  </span>
                  <span className="truncate">{o.nome}</span>
                </button>
              );
            })}
          </div>
        </div>

        {value.length > 0 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => onChange([])}>
            Limpar seleção
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function FiltrosFinanceiros({
  value,
  onChange,
  dados,
  mostrar = ["periodo", "empresa", "cliente", "veiculo", "motorista", "status", "busca"],
  buscaPlaceholder = "Cliente, OS, nota fiscal, placa…",
  extra,
}: {
  value: FiltrosFin;
  onChange: (f: FiltrosFin) => void;
  dados?: BiDados;
  mostrar?: Array<"periodo" | "empresa" | "cliente" | "veiculo" | "motorista" | "status" | "busca">;
  buscaPlaceholder?: string;
  extra?: React.ReactNode;
}) {
  const { data: empresas = [] } = useEmpresas();
  const set = (patch: Partial<FiltrosFin>) => onChange({ ...value, ...patch });
  const show = (k: string) => mostrar.includes(k as never);

  return (
    <Card className="space-y-3 p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {show("periodo") && (
          <>
            <Field label="Data inicial">
              <Input type="date" className="h-9" value={value.de} onChange={(e) => set({ de: e.target.value })} />
            </Field>
            <Field label="Data final">
              <Input type="date" className="h-9" value={value.ate} onChange={(e) => set({ ate: e.target.value })} />
            </Field>
          </>
        )}

        {show("empresa") && empresas.length > 0 && (
          <Field label="Empresa">
            <Select value={value.empresaId} onValueChange={(v) => set({ empresaId: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as empresas</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {show("cliente") && (
          <Field label="Clientes">
            <MultiSelect
              opcoes={dados?.clientes ?? []}
              value={value.clienteIds}
              onChange={(v) => set({ clienteIds: v })}
              placeholder="Buscar cliente…"
              vazioLabel="Todos os clientes"
            />
          </Field>
        )}

        {show("veiculo") && (
          <Field label="Veículos / Placas">
            <MultiSelect
              opcoes={(dados?.veiculos ?? []).map((v) => ({ id: v.id, nome: v.label }))}
              value={value.veiculoIds}
              onChange={(v) => set({ veiculoIds: v })}
              placeholder="Buscar placa…"
              vazioLabel="Todos os veículos"
            />
          </Field>
        )}

        {show("motorista") && (
          <Field label="Motoristas">
            <MultiSelect
              opcoes={dados?.motoristas ?? []}
              value={value.motoristaIds}
              onChange={(v) => set({ motoristaIds: v })}
              placeholder="Buscar motorista…"
              vazioLabel="Todos os motoristas"
            />
          </Field>
        )}

        {show("status") && (
          <Field label="Status">
            <Select value={value.status} onValueChange={(v) => set({ status: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPCOES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {show("busca") && (
          <Field label="Pesquisa rápida">
            <Input
              className="h-9"
              placeholder={buscaPlaceholder}
              value={value.busca}
              onChange={(e) => set({ busca: e.target.value })}
            />
          </Field>
        )}

        {extra}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...filtrosIniciais(), de: value.de, ate: value.ate })}>
          <FilterX className="mr-1 size-3.5" /> Limpar filtros
        </Button>
      </div>
    </Card>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
