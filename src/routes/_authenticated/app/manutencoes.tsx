import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench, Pencil, Trash2, Loader2 } from "lucide-react";

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

export const Route = createFileRoute("/_authenticated/app/manutencoes")({
  head: () => ({ meta: [{ title: "Manutenções — G3 Expresso" }] }),
  component: ManutencoesPage,
});

type Manut = {
  id: string;
  veiculo_id: string;
  fornecedor_id: string | null;
  data: string;
  km_atual: number | null;
  tipo: string;
  oficina: string | null;
  descricao: string | null;
  valor: number;
  proxima_revisao_data: string | null;
  proxima_revisao_km: number | null;
  nota_path: string | null;
  observacoes: string | null;
};

const TIPOS = ["Preventiva", "Corretiva", "Troca de óleo", "Pneus", "Freios", "Suspensão", "Elétrica", "Revisão", "Outro"];

const empty: Partial<Manut> = { data: new Date().toISOString().slice(0, 10), tipo: "Preventiva", valor: 0 };

function ManutencoesPage() {
  const { user, role } = useAuth();
  const isStaff = role === "administrador" || role === "gestor" || role === "financeiro";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<Partial<Manut>>(empty);

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-opt-manut"],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos").select("id, placa, modelo").order("placa");
      if (error) throw error;
      return data;
    },
  });

  const { data: fornecedores = [] } = useQuery({
    queryKey: ["fornecedores-opt-manut"],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase.from("fornecedores").select("id, nome_fantasia, razao_social").eq("ativo", true).order("nome_fantasia");
      if (error) throw error;
      return data as { id: string; nome_fantasia: string | null; razao_social: string | null }[];
    },
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["manutencoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manutencoes")
        .select("*, veiculo:veiculos(placa, modelo), fornecedor:fornecedores(nome_fantasia)")
        .order("data", { ascending: false });
      if (error) throw error;
      return data as (Manut & { veiculo: { placa: string; modelo: string } | null; fornecedor: { nome_fantasia: string | null } | null })[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.veiculo_id) throw new Error("Selecione o veículo");
      if (!form.data) throw new Error("Informe a data");
      if (!form.tipo) throw new Error("Informe o tipo");

      let nota_path = form.nota_path ?? null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "pdf";
        const path = `${form.veiculo_id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("manutencao-notas").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        nota_path = path;
      }

      const payload = {
        veiculo_id: form.veiculo_id,
        fornecedor_id: form.fornecedor_id || null,
        data: form.data,
        km_atual: form.km_atual ? Number(form.km_atual) : null,
        tipo: form.tipo,
        oficina: form.oficina || null,
        descricao: form.descricao || null,
        valor: Number(form.valor ?? 0),
        proxima_revisao_data: form.proxima_revisao_data || null,
        proxima_revisao_km: form.proxima_revisao_km ? Number(form.proxima_revisao_km) : null,
        nota_path,
        observacoes: form.observacoes || null,
        created_by: user!.id,
      };
      if (form.id) {
        const { error } = await supabase.from("manutencoes").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("manutencoes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Manutenção atualizada" : "Manutenção registrada");
      qc.invalidateQueries({ queryKey: ["manutencoes"] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
      setOpen(false);
      setForm(empty);
      setFile(null);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manutencoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["manutencoes"] }); qc.invalidateQueries({ queryKey: ["financeiro"] }); qc.invalidateQueries({ queryKey: ["admin-dashboard"] }); qc.invalidateQueries({ queryKey: ["motorista-dashboard"] }); qc.invalidateQueries({ queryKey: ["viagem-financeiro"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const filtered = data.filter((m) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (m.tipo ?? "").toLowerCase().includes(q) ||
      (m.oficina ?? "").toLowerCase().includes(q) ||
      (m.veiculo?.placa ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <PageShell
      icon={Wrench}
      title="Manutenções"
      subtitle="Histórico de manutenções e revisões"
      search={search}
      onSearch={setSearch}
      canAdd={isStaff}
      addLabel="Nova manutenção"
      onAdd={() => { setForm(empty); setFile(null); setOpen(true); }}
    >
      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhuma manutenção registrada.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Oficina</TableHead>
                <TableHead>KM</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Próxima</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{new Date(m.data).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell className="font-mono text-xs">{m.veiculo?.placa ?? "—"}</TableCell>
                  <TableCell className="text-xs">{m.tipo}</TableCell>
                  <TableCell className="text-xs">{m.oficina ?? m.fornecedor?.nome_fantasia ?? "—"}</TableCell>
                  <TableCell className="text-xs">{m.km_atual ? Number(m.km_atual).toFixed(0) : "—"}</TableCell>
                  <TableCell className="text-xs font-medium">R$ {Number(m.valor).toFixed(2)}</TableCell>
                  <TableCell className="text-xs">
                    {m.proxima_revisao_data ? new Date(m.proxima_revisao_data).toLocaleDateString("pt-BR") : ""}
                    {m.proxima_revisao_km ? ` · ${Number(m.proxima_revisao_km).toFixed(0)} km` : ""}
                    {!m.proxima_revisao_data && !m.proxima_revisao_km && "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {isStaff && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => { setForm(m); setOpen(true); }}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => confirm("Excluir manutenção?") && del.mutate(m.id)}><Trash2 className="size-4" /></Button>
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
          <DialogHeader><DialogTitle>{form.id ? "Editar manutenção" : "Nova manutenção"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Data *"><Input type="date" value={form.data ?? ""} onChange={(e) => setForm({ ...form, data: e.target.value })} /></F>
            <F label="KM atual"><Input type="number" step="0.1" value={form.km_atual ?? ""} onChange={(e) => setForm({ ...form, km_atual: Number(e.target.value) })} /></F>

            <F label="Veículo *">
              <Select value={form.veiculo_id ?? ""} onValueChange={(v) => setForm({ ...form, veiculo_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {veiculos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.placa} · {v.modelo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>

            <F label="Tipo *">
              <Select value={form.tipo ?? ""} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </F>

            <F label="Oficina"><Input value={form.oficina ?? ""} onChange={(e) => setForm({ ...form, oficina: e.target.value })} /></F>
            <F label="Fornecedor">
              <Select value={form.fornecedor_id ?? "none"} onValueChange={(v) => setForm({ ...form, fornecedor_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome_fantasia ?? f.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>

            <F label="Valor (R$)"><Input type="number" step="0.01" value={form.valor ?? 0} onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })} /></F>
            <div />

            <F label="Próxima revisão (data)"><Input type="date" value={form.proxima_revisao_data ?? ""} onChange={(e) => setForm({ ...form, proxima_revisao_data: e.target.value })} /></F>
            <F label="Próxima revisão (km)"><Input type="number" step="0.1" value={form.proxima_revisao_km ?? ""} onChange={(e) => setForm({ ...form, proxima_revisao_km: Number(e.target.value) })} /></F>

            <div className="md:col-span-2"><F label="Descrição do serviço"><Textarea rows={2} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></F></div>
            <div className="md:col-span-2">
              <F label="Nota fiscal / anexo">
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
