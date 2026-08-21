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
import { DecimalInput } from "@/components/ui/decimal-input";
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

type ManutForm = Partial<Manut> & { motorista_id?: string | null };

const empty: ManutForm = { data: new Date().toISOString().slice(0, 10), tipo: "Preventiva", valor: 0 };

function ManutencoesPage() {
  const { user, role } = useAuth();
  const isStaff = role === "administrador" || role === "gestor" || role === "financeiro";
  const isMotorista = role === "motorista";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<ManutForm>(empty);

  const { data: meMotorista } = useQuery({
    queryKey: ["me-motorista-manut", user?.id],
    enabled: !!user?.id && isMotorista,
    queryFn: async () => {
      const { data } = await supabase
        .from("motoristas")
        .select("id, nome, veiculo_id, veiculo:veiculos(placa, modelo)")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as { id: string; nome: string; veiculo_id: string | null; veiculo: { placa: string; modelo: string } | null } | null;
    },
  });

  const novo = () => {
    setForm({ ...empty, veiculo_id: isMotorista ? meMotorista?.veiculo_id ?? undefined : undefined, motorista_id: isMotorista ? meMotorista?.id ?? null : null });
    setFile(null);
    setOpen(true);
  };

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
        motorista_id: form.motorista_id ?? (isMotorista ? meMotorista?.id ?? null : null),
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
    // Período pela data da manutenção (fato).
    const ref = (m.data ?? "").slice(0, 10);
    if (dataDe && (!ref || ref < dataDe)) return false;
    if (dataAte && (!ref || ref > dataAte)) return false;
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
      subtitle={isMotorista ? `Veículo vinculado: ${meMotorista?.veiculo?.placa ?? "—"}` : "Histórico de manutenções e revisões"}
      search={search}
      onSearch={setSearch}
      canAdd={isStaff || (isMotorista && !!meMotorista?.veiculo_id)}
      addLabel="Nova manutenção"
      onAdd={novo}
    >
      <Card className="p-3">
        <div className="grid gap-2 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Data da manutenção — de</Label>
            <Input type="date" className="h-9" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Até</Label>
            <Input type="date" className="h-9" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </div>
          <div className="flex items-end justify-between gap-2 text-xs text-muted-foreground md:col-span-2">
            <span>{filtered.length} registro(s)</span>
            {(dataDe || dataAte) && (
              <Button variant="ghost" size="sm" onClick={() => { setDataDe(""); setDataAte(""); }}>Limpar</Button>
            )}
          </div>
        </div>
      </Card>

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
            <F label="KM atual"><DecimalInput decimais={1} value={form.km_atual ?? ""} onChange={(v) => setForm({ ...form, km_atual: v === "" ? undefined : Number(v) })} /></F>

            <F label="Veículo *">
              <Select value={form.veiculo_id ?? ""} onValueChange={(v) => setForm({ ...form, veiculo_id: v })} disabled={isMotorista}>
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
            {!isMotorista && <F label="Fornecedor">
              <Select value={form.fornecedor_id ?? "none"} onValueChange={(v) => setForm({ ...form, fornecedor_id: v === "none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome_fantasia ?? f.razao_social}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </F>}

            <F label="Valor (R$)"><DecimalInput decimais={2} value={form.valor ?? 0} onChange={(v) => setForm({ ...form, valor: v === "" ? undefined : Number(v) })} /></F>
            <div />

            <F label="Próxima revisão (data)"><Input type="date" value={form.proxima_revisao_data ?? ""} onChange={(e) => setForm({ ...form, proxima_revisao_data: e.target.value })} /></F>
            <F label="Próxima revisão (km)"><DecimalInput decimais={1} value={form.proxima_revisao_km ?? ""} onChange={(v) => setForm({ ...form, proxima_revisao_km: v === "" ? undefined : Number(v) })} /></F>

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
