import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building, Pencil, Trash2, Loader2, Copy, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { consultarCnpj } from "@/lib/cnpj.functions";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import { TabelasFreteButton } from "@/components/clientes/tabelas-frete";

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
  const [duplicando, setDuplicando] = useState(false);
  const [operacao, setOperacao] = useState("");

  const duplicar = (c: Cliente) => {
    const { id: _id, ...rest } = c;
    setForm({ ...rest });
    setOperacao("");
    setDuplicando(true);
    setOpen(true);
  };

  const buscarCnpjFn = useServerFn(consultarCnpj);
  const buscarCnpj = useMutation({
    mutationFn: async (cnpj: string) => await buscarCnpjFn({ data: { cnpj } }),
    onSuccess: (d) => {
      setForm((f) => ({
        ...f,
        tipo: "pj",
        cnpj_cpf: d.cnpj,
        razao_social: d.razao_social || f.razao_social,
        nome_fantasia: d.nome_fantasia ?? f.nome_fantasia ?? null,
        telefone: d.telefone ?? f.telefone ?? null,
        email: d.email ?? f.email ?? null,
        endereco: d.endereco ?? f.endereco ?? null,
        cidade: d.cidade ?? f.cidade ?? null,
        uf: d.uf ?? f.uf ?? null,
        cep: d.cep ?? f.cep ?? null,
      }));
      toast.success("Dados preenchidos pela Receita Federal", {
        description: d.situacao ? `Situação cadastral: ${d.situacao}` : undefined,
      });
    },
    onError: (e: Error) => toast.error("CNPJ", { description: e.message }),
  });

  const tentarBuscarCnpj = () => {
    const digits = (form.cnpj_cpf ?? "").replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ inválido", { description: "Informe os 14 dígitos do CNPJ." });
      return;
    }
    buscarCnpj.mutate(digits);
  };

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
      if (duplicando && !operacao.trim()) throw new Error("Informe o nome da operação para diferenciar o cadastro");
      const sufixo = duplicando ? ` - ${operacao.trim()}` : "";
      const payload = {
        tipo: (form.tipo ?? "pj") as "pf" | "pj",
        razao_social: `${form.razao_social.trim()}${sufixo}`,
        nome_fantasia: form.nome_fantasia ? `${form.nome_fantasia}${sufixo}` : null,
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
      toast.success(form.id ? "Cliente atualizado" : duplicando ? "Cliente duplicado" : "Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpen(false);
      setForm(empty);
      setDuplicando(false);
      setOperacao("");
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
      onAdd={() => { setForm(empty); setDuplicando(false); setOperacao(""); setOpen(true); }}
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
                    {canWrite && <TabelasFreteButton clienteId={c.id} clienteNome={c.razao_social} />}
                    {canWrite && <Button variant="ghost" size="icon" title="Duplicar para outra operação" onClick={() => duplicar(c)}><Copy className="size-4" /></Button>}
                    {canWrite && <Button variant="ghost" size="icon" onClick={() => { setForm(c); setDuplicando(false); setOperacao(""); setOpen(true); }}><Pencil className="size-4" /></Button>}
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
          <DialogHeader><DialogTitle>{form.id ? "Editar cliente" : duplicando ? "Duplicar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          {duplicando && (
            <div className="rounded-md border border-brand/40 bg-brand/5 p-3">
              <F label="Nome da operação *">
                <Input
                  autoFocus
                  placeholder="Ex.: Operação Bertioga"
                  value={operacao}
                  onChange={(e) => setOperacao(e.target.value)}
                />
              </F>
              <p className="mt-2 text-xs text-muted-foreground">
                Será criado um novo cliente com os mesmos dados: <span className="font-medium">{form.razao_social}{operacao.trim() ? ` - ${operacao.trim()}` : ""}</span>
              </p>
            </div>
          )}
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
            <F label="CNPJ / CPF">
              <div className="flex gap-2">
                <Input
                  value={form.cnpj_cpf ?? ""}
                  placeholder={form.tipo === "pf" ? "CPF" : "CNPJ — pressione Enter para buscar"}
                  onChange={(e) => setForm({ ...form, cnpj_cpf: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (form.tipo !== "pf") tentarBuscarCnpj();
                    }
                  }}
                />
                {form.tipo !== "pf" && (
                  <Button type="button" variant="outline" size="icon" title="Buscar dados do CNPJ" onClick={tentarBuscarCnpj} disabled={buscarCnpj.isPending}>
                    {buscarCnpj.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </F>
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
