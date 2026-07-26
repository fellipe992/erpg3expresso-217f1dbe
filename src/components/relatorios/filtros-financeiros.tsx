import { useQuery } from "@tanstack/react-query";
import { FilterX } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BiDados, LancBi } from "@/hooks/use-bi-dados";

export type FiltrosFin = {
  de: string;
  ate: string;
  empresaId: string;
  clienteId: string;
  veiculoId: string;
  motoristaId: string;
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

export function filtrosIniciais(diasAtras = 90): FiltrosFin {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - diasAtras);
  return {
    de: inicio.toISOString().slice(0, 10),
    ate: hoje.toISOString().slice(0, 10),
    empresaId: "todas",
    clienteId: "todos",
    veiculoId: "todos",
    motoristaId: "todos",
    status: "todos",
    busca: "",
  };
}

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
          <Field label="Cliente">
            <Select value={value.clienteId} onValueChange={(v) => set({ clienteId: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os clientes</SelectItem>
                {(dados?.clientes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {show("veiculo") && (
          <Field label="Veículo / Placa">
            <Select value={value.veiculoId} onValueChange={(v) => set({ veiculoId: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os veículos</SelectItem>
                {(dados?.veiculos ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {show("motorista") && (
          <Field label="Motorista">
            <Select value={value.motoristaId} onValueChange={(v) => set({ motoristaId: v })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os motoristas</SelectItem>
                {(dados?.motoristas ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
