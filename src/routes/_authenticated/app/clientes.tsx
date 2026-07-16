import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building, Pencil, Trash2, Loader2 } from "lucide-react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/app/clientes")({
  head: () => ({ meta: [{ title: "Clientes — G3 Expresso" }] }),
  component: ClientesPage,
});

type Cliente = {
  id: string;
  tipo: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  inscricao_estadual: string | null;
  contato_nome: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  ativo: boolean;
  observacoes: string | null;
};

const empty: Partial<Cliente> = { tipo: "pj", razao_social: "", ativo: true };

function ClientesPage() {
  const { role } = useAuth();
  const canWrite = role === "administrador" || role === "gestor" || role === "financeiro";
  const isAdmin = role === "administrador";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Cliente>>(empty);

  const { data = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("*").order("razao_social");
      if (error) throw error;
      return data as Cliente[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.razao_social?.trim()) throw new Error("Razão social / Nome é obrigatório");
      const payload = {
        tipo: form.tipo ?? "pj",
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia || null,
        cnpj_cpf: form.cnpj_cpf || null,
        inscricao_estadual: form.inscricao_estadual || null,
        contato_nome: form.contato_nome || null,
        telefone: form.telefone || null,
        email: form.email || null,
        endereco: form.endereco || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
        cep: form.cep || null,
        ativo: form.ativo ?? true,
        observacoes: form.observacoes || null,
      };
      if (form.id) {
        const { error } = await supabase.from("clientes").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clientes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Cliente atualizado" : "Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpen(false);
      setForm(empty);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente removido");
      qc.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const filtered = data.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.razao_social.toLowerCase().includes(q) || (c.nome_fantasia ?? "").toLowerCase().includes(q) || (c.cnpj_cpf ?? "").includes(q);
  });

  return (
    <PageShell
      icon={Building}
      title="Clientes"
      subtitle="Empresas e pessoas atendidas"
      search={search}
      onSearch={setSearch}
      canAdd={canWrite}
      addLabel="Novo cliente"
      onAdd={() => { setForm(empty); setOpen(true); }}
    >
      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhum cliente cadastrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome / Razão social</TableHead>
                <TableHead>CNPJ / CPF</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.razao_social}</div>
                    {c.nome_fantasia && <div className="text-xs text-muted-foreground">{c.nome_fantasia}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{c.cnpj_cpf ?? "—"}</TableCell>
                  <TableCell>{[c.cidade, c.uf].filter(Boolean).join("/") || "—"}</TableCell>
                  <TableCell>
                    <div className="text-sm">{c.contato_nome ?? "—"}</div>
                    {c.telefone && <div className="text-xs text-muted-foreground">{c.telefone}</div>}
                  </TableCell>
                  <TableCell><Badge variant={c.ativo ? "default" : "outline"}>{c.ativo ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell className="text-right">
                    {canWrite && <Button variant="ghost" size="icon" onClick={() => { setForm(c); setOpen(true); }}><Pencil className="size-4" /></Button>}
                    {isAdmin && <Button variant="ghost" size="icon" onClick={() => confirm(`Excluir ${c.razao_social}?`) && del.mutate(c.id)}><Trash2 className="size-4" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Tipo">
              <Select value={form.tipo ?? "pj"} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                  <SelectItem value="pf">Pessoa Física</SelectItem>
                </SelectContent>
              </Select>
            </F>
            <F label="CNPJ / CPF"><Input value={form.cnpj_cpf ?? ""} onChange={(e) => setForm({ ...form, cnpj_cpf: e.target.value })} /></F>
            <div className="md:col-span-2"><F label={form.tipo === "pf" ? "Nome *" : "Razão social *"}><Input value={form.razao_social ?? ""} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} /></F></div>
            <F label="Nome fantasia"><Input value={form.nome_fantasia ?? ""} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></F>
            <F label="Inscrição estadual"><Input value={form.inscricao_estadual ?? ""} onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })} /></F>
            <F label="Contato"><Input value={form.contato_nome ?? ""} onChange={(e) => setForm({ ...form, contato_nome: e.target.value })} /></F>
            <F label="Telefone"><Input value={form.telefone ?? ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></F>
            <div className="md:col-span-2"><F label="E-mail"><Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></F></div>
            <div className="md:col-span-2"><F label="Endereço"><Input value={form.endereco ?? ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></F></div>
            <F label="Cidade"><Input value={form.cidade ?? ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} /></F>
            <F label="UF"><Input maxLength={2} value={form.uf ?? ""} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></F>
            <F label="CEP"><Input value={form.cep ?? ""} onChange={(e) => setForm({ ...form, cep: e.target.value })} /></F>
            <div className="flex items-center gap-2 pt-6">
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
