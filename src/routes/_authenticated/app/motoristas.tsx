import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Pencil, Trash2, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/motoristas")({
  head: () => ({ meta: [{ title: "Motoristas — G3 Expresso" }] }),
  component: MotoristasPage,
});

type Motorista = {
  id: string;
  nome: string;
  cpf: string | null;
  cnh: string | null;
  cnh_categoria: string | null;
  cnh_validade: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  observacoes: string | null;
  veiculo_id: string | null;
};

type VeiculoOpt = { id: string; placa: string; modelo: string };

const empty: Partial<Motorista> = { nome: "", ativo: true };

function MotoristasPage() {
  const { role } = useAuth();
  const canWrite = role === "administrador" || role === "gestor" || role === "financeiro";
  const isAdmin = role === "administrador";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Motorista>>(empty);

  const { data = [], isLoading } = useQuery({
    queryKey: ["motoristas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("motoristas").select("*").order("nome");
      if (error) throw error;
      return data as Motorista[];
    },
  });

  const { data: veiculos = [] } = useQuery({
    queryKey: ["veiculos-opt"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("veiculos")
        .select("id, placa, modelo, ativo")
        .eq("ativo", true)
        .order("placa");
      if (error) throw error;
      return data as (VeiculoOpt & { ativo: boolean })[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome?.trim()) throw new Error("Nome é obrigatório");
      const payload = {
        nome: form.nome.trim(),
        cpf: form.cpf || null,
        cnh: form.cnh || null,
        cnh_categoria: form.cnh_categoria || null,
        cnh_validade: form.cnh_validade || null,
        telefone: form.telefone || null,
        email: form.email || null,
        endereco: form.endereco || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
        ativo: form.ativo ?? true,
        observacoes: form.observacoes || null,
      };
      if (form.id) {
        const { error } = await supabase.from("motoristas").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("motoristas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Motorista atualizado" : "Motorista cadastrado");
      qc.invalidateQueries({ queryKey: ["motoristas"] });
      setOpen(false);
      setForm(empty);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("motoristas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Motorista removido");
      qc.invalidateQueries({ queryKey: ["motoristas"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const filtered = data.filter((m) => {
    const q = search.toLowerCase();
    return !q || m.nome.toLowerCase().includes(q) || (m.cpf ?? "").includes(q) || (m.cnh ?? "").includes(q);
  });

  return (
    <PageShell
      icon={Users}
      title="Motoristas"
      subtitle="Cadastro de condutores"
      search={search}
      onSearch={setSearch}
      canAdd={canWrite}
      addLabel="Novo motorista"
      onAdd={() => { setForm(empty); setOpen(true); }}
    >
      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhum motorista cadastrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>CNH</TableHead>
                <TableHead>Validade CNH</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.nome}</TableCell>
                  <TableCell className="font-mono text-xs">{m.cpf ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{m.cnh ?? "—"}{m.cnh_categoria && ` (${m.cnh_categoria})`}</TableCell>
                  <TableCell>{m.cnh_validade ? new Date(m.cnh_validade).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell>{m.telefone ?? "—"}</TableCell>
                  <TableCell><Badge variant={m.ativo ? "default" : "outline"}>{m.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell className="text-right">
                    {canWrite && <Button variant="ghost" size="icon" onClick={() => { setForm(m); setOpen(true); }}><Pencil className="size-4" /></Button>}
                    {isAdmin && <Button variant="ghost" size="icon" onClick={() => confirm(`Excluir ${m.nome}?`) && del.mutate(m.id)}><Trash2 className="size-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Editar motorista" : "Novo motorista"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><F label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></F></div>
            <F label="CPF"><Input value={form.cpf ?? ""} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" /></F>
            <F label="Telefone"><Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></F>
            <F label="CNH"><Input value={form.cnh ?? ""} onChange={(e) => setForm({ ...form, cnh: e.target.value })} /></F>
            <F label="Categoria CNH"><Input value={form.cnh_categoria ?? ""} onChange={(e) => setForm({ ...form, cnh_categoria: e.target.value })} placeholder="B, C, D, E..." /></F>
            <F label="Validade CNH"><Input type="date" value={form.cnh_validade ?? ""} onChange={(e) => setForm({ ...form, cnh_validade: e.target.value })} /></F>
            <F label="E-mail"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></F>
            <div className="md:col-span-2"><F label="Endereço"><Input value={form.endereco ?? ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></F></div>
            <F label="Cidade"><Input value={form.cidade ?? ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></F>
            <F label="UF"><Input maxLength={2} value={form.uf ?? ""} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></F>
            <div className="flex items-center gap-2 md:col-span-2">
              <Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativo</Label>
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
