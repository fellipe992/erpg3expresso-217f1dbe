import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fuel, Pencil, Trash2, Loader2, Upload } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/app/abastecimentos")({
  head: () => ({ meta: [{ title: "Abastecimentos — G3 Expresso" }] }),
  component: AbastecimentosPage,
});

type Abast = {
  id: string;
  veiculo_id: string;
  motorista_id: string | null;
  data: string;
  hora: string | null;
  posto: string | null;
  combustivel: string | null;
  litros: number;
  valor_litro: number;
  valor_total: number;
  km_atual: number;
  km_percorridos: number | null;
  consumo_medio: number | null;
  custo_por_km: number | null;
  observacoes: string | null;
  comprovante_path: string | null;
  forma_pagamento_operacional: string | null;
};

const COMBUSTIVEIS = ["Diesel S10", "Diesel S500", "Arla 32", "Gasolina", "Etanol", "GNV"];
const FORMAS_PAGTO = [
  { value: "convenio", label: "Convênio (vence em 30 dias)" },
  { value: "cartao", label: "Cartão (vencimento na fatura)" },
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outro", label: "Outro" },
];

function AbastecimentosPage() {
  const { user, role } = useAuth();
  const isMotorista = role === "motorista";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const { data: meMotorista } = useQuery({
    queryKey: ["me-motorista", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("motoristas")
        .select("id, nome, veiculo_id, veiculo:veiculos(id, placa, modelo)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as { id: string; nome: string; veiculo_id: string | null; veiculo: { id: string; placa: string; modelo: string } | null } | null;
    },
  });

  const emptyForm: Partial<Abast> = useMemo(() => {
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return {
      data: localDate,
      veiculo_id: isMotorista ? meMotorista?.veiculo_id ?? "" : "",
      motorista_id: isMotorista ? meMotorista?.id ?? null : null,
      combustivel: "Diesel S10",
    };
  }, [isMotorista, meMotorista]);

  const [form, setForm] = useState<Partial<Abast>>(emptyForm);

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-opt-abast"],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos").select("id, placa, modelo").eq("ativo", true).order("placa");
      if (error) throw error;
      return data;
    },
  });

  const { data: motoristas = [] } = useQuery({
    queryKey: ["motoristas-opt-abast"],
    enabled: !isMotorista,
    queryFn: async () => {
      const { data, error } = await supabase.from("motoristas").select("id, nome, veiculo_id").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["abastecimentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("abastecimentos")
        .select("*, veiculo:veiculos(placa, modelo), motorista:motoristas(nome)")
        .order("data", { ascending: false })
        .order("hora", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as (Abast & { veiculo: { placa: string; modelo: string } | null; motorista: { nome: string } | null })[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.veiculo_id) throw new Error("Selecione o veículo");
      if (!form.data) throw new Error("Informe a data");
      if (!form.litros || Number(form.litros) <= 0) throw new Error("Informe os litros");
      if (!form.valor_litro || Number(form.valor_litro) <= 0) throw new Error("Informe o valor por litro");
      if (!form.km_atual || Number(form.km_atual) <= 0) throw new Error("Informe a quilometragem atual");

      let comprovante_path = form.comprovante_path ?? null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${user!.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("abastecimento-comprovantes").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        comprovante_path = path;
      }

      const litros = Number(form.litros);
      const valor_litro = Number(form.valor_litro);
      const valor_total = form.valor_total ? Number(form.valor_total) : Number((litros * valor_litro).toFixed(2));

      const payload = {
        veiculo_id: form.veiculo_id,
        motorista_id: form.motorista_id || null,
        data: form.data,
        hora: form.hora || null,
        posto: form.posto || null,
        combustivel: form.combustivel || null,
        litros,
        valor_litro,
        valor_total,
        km_atual: Number(form.km_atual),
        observacoes: form.observacoes || null,
        comprovante_path,
        forma_pagamento_operacional: form.forma_pagamento_operacional || null,
        created_by: user!.id,
      };
      if (form.id) {
        const { error } = await supabase.from("abastecimentos").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("abastecimentos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Abastecimento atualizado" : "Abastecimento registrado");
      qc.invalidateQueries({ queryKey: ["abastecimentos"] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
      setOpen(false);
      setForm(emptyForm);
      setFile(null);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("abastecimentos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["abastecimentos"] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const filtered = data.filter((a) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (a.posto ?? "").toLowerCase().includes(q) ||
      (a.veiculo?.placa ?? "").toLowerCase().includes(q) ||
      (a.motorista?.nome ?? "").toLowerCase().includes(q)
    );
  });

  const openNew = () => {
    setForm(emptyForm);
    setFile(null);
    setOpen(true);
  };

  const litros = Number(form.litros ?? 0);
  const vl = Number(form.valor_litro ?? 0);
  const total = form.valor_total ?? (litros && vl ? (litros * vl).toFixed(2) : "");

  return (
    <PageShell
      icon={Fuel}
      title="Abastecimentos"
      subtitle={isMotorista ? `Veículo vinculado: ${meMotorista?.veiculo?.placa ?? "—"}` : "Controle de combustível e consumo"}
      search={search}
      onSearch={setSearch}
      canAdd={!isMotorista || !!meMotorista?.veiculo_id}
      addLabel="Novo abastecimento"
      onAdd={openNew}
    >
      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhum abastecimento registrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Motorista</TableHead>
                <TableHead>Litros</TableHead>
                <TableHead>R$/L</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>KM</TableHead>
                <TableHead>Consumo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs">{a.data.split("-").reverse().join("/")}{a.hora && ` ${a.hora.slice(0, 5)}`}</TableCell>
                  <TableCell className="font-mono text-xs">{a.veiculo?.placa ?? "—"}</TableCell>
                  <TableCell className="text-xs">{a.motorista?.nome ?? "—"}</TableCell>
                  <TableCell className="text-xs">{Number(a.litros).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">R$ {Number(a.valor_litro).toFixed(3)}</TableCell>
                  <TableCell className="text-xs font-medium">R$ {Number(a.valor_total).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">{Number(a.km_atual).toFixed(0)}</TableCell>
                  <TableCell className="text-xs">
                    {a.consumo_medio ? (
                      <Badge variant="outline">{a.consumo_medio} km/L</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isMotorista && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => { setForm(a); setOpen(true); }}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => confirm("Excluir abastecimento?") && del.mutate(a.id)}><Trash2 className="size-4" /></Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Editar abastecimento" : "Novo abastecimento"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Data *"><Input type="date" value={form.data ?? ""} onChange={(e) => setForm({ ...form, data: e.target.value })} /></F>
            <F label="Hora"><Input type="time" value={form.hora ?? ""} onChange={(e) => setForm({ ...form, hora: e.target.value })} /></F>

            <F label="Veículo *">
              <Select
                value={form.veiculo_id ?? ""}
                onValueChange={(v) => setForm({ ...form, veiculo_id: v })}
                disabled={isMotorista}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {veiculos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.placa} · {v.modelo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>

            <F label="Motorista">
              <Select
                value={form.motorista_id ?? "none"}
                onValueChange={(v) => setForm({ ...form, motorista_id: v === "none" ? null : v })}
                disabled={isMotorista}
              >
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {(isMotorista && meMotorista ? [{ id: meMotorista.id, nome: meMotorista.nome, veiculo_id: meMotorista.veiculo_id }] : motoristas).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>

            <F label="Posto"><Input value={form.posto ?? ""} onChange={(e) => setForm({ ...form, posto: e.target.value })} /></F>
            <F label="Combustível">
              <Select value={form.combustivel ?? ""} onValueChange={(v) => setForm({ ...form, combustivel: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {COMBUSTIVEIS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>

            <F label="Litros *"><Input type="number" step="0.001" value={form.litros ?? ""} onChange={(e) => setForm({ ...form, litros: Number(e.target.value) })} /></F>
            <F label="R$ por litro *"><Input type="number" step="0.001" value={form.valor_litro ?? ""} onChange={(e) => setForm({ ...form, valor_litro: Number(e.target.value) })} /></F>
            <F label="Total (R$)"><Input type="number" step="0.01" value={String(total)} onChange={(e) => setForm({ ...form, valor_total: Number(e.target.value) })} placeholder="Auto" /></F>
            <F label="KM atual *"><Input type="number" step="0.1" value={form.km_atual ?? ""} onChange={(e) => setForm({ ...form, km_atual: Number(e.target.value) })} /></F>

            <div className="md:col-span-2">
              <F label="Forma de pagamento *">
                <Select value={form.forma_pagamento_operacional ?? ""} onValueChange={(v) => setForm({ ...form, forma_pagamento_operacional: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {FORMAS_PAGTO.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            </div>
            <div className="md:col-span-2">
              <F label="Comprovante (foto ou PDF)">
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  {file && <Upload className="size-4 text-brand" />}
                </div>
              </F>
            </div>
            <div className="md:col-span-2"><F label="Observações"><Textarea rows={2} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></F></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>);
}
