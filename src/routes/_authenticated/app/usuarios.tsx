import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users, Pencil, KeyRound, Loader2 } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createUser, resetUserPassword, setUserRole } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/app/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — G3 Expresso" }] }),
  component: UsuariosPage,
});

type Role = "administrador" | "financeiro" | "gestor" | "motorista";

type Row = {
  id: string;
  email: string;
  nome: string;
  telefone: string | null;
  ativo: boolean;
  role: Role | null;
  motorista_id: string | null;
  motorista_nome: string | null;
};

function UsuariosPage() {
  const { role } = useAuth();
  const isAdmin = role === "administrador";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [openPwd, setOpenPwd] = useState<Row | null>(null);

  const createFn = useServerFn(createUser);
  const resetFn = useServerFn(resetUserPassword);
  const roleFn = useServerFn(setUserRole);

  const { data = [], isLoading } = useQuery({
    queryKey: ["usuarios-admin"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, email, nome, telefone, ativo")
        .order("nome");
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const { data: mots } = await supabase.from("motoristas").select("id, nome, user_id");
      return (profiles ?? []).map((p) => {
        const r = roles?.find((x) => x.user_id === p.id);
        const m = mots?.find((x) => x.user_id === p.id);
        return {
          ...p,
          role: (r?.role as Role) ?? null,
          motorista_id: m?.id ?? null,
          motorista_nome: m?.nome ?? null,
        } as Row;
      });
    },
  });

  const { data: motoristasLivres = [] } = useQuery({
    queryKey: ["motoristas-livres"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("motoristas")
        .select("id, nome, user_id")
        .is("user_id", null)
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<{
    email: string; password: string; nome: string; telefone: string; role: Role; motorista_id: string;
  }>({ email: "", password: "", nome: "", telefone: "", role: "motorista", motorista_id: "" });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.email || !form.password || !form.nome) throw new Error("Preencha nome, e-mail e senha");
      if (form.password.length < 6) throw new Error("Senha mínima de 6 caracteres");
      return createFn({
        data: {
          email: form.email.trim(),
          password: form.password,
          nome: form.nome.trim(),
          telefone: form.telefone || null,
          role: form.role,
          motorista_id: form.role === "motorista" && form.motorista_id ? form.motorista_id : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Usuário criado");
      qc.invalidateQueries({ queryKey: ["usuarios-admin"] });
      qc.invalidateQueries({ queryKey: ["motoristas-livres"] });
      setOpenNew(false);
      setForm({ email: "", password: "", nome: "", telefone: "", role: "motorista", motorista_id: "" });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (row: Row) => {
      const { error } = await supabase.from("profiles").update({ ativo: !row.ativo }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios-admin"] });
      toast.success("Status alterado");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const changeRole = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: Role }) =>
      roleFn({ data: { user_id, role } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios-admin"] });
      toast.success("Perfil atualizado");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const [newPwd, setNewPwd] = useState("");
  const resetMut = useMutation({
    mutationFn: async () => {
      if (!openPwd) return;
      if (newPwd.length < 6) throw new Error("Mínimo 6 caracteres");
      return resetFn({ data: { user_id: openPwd.id, password: newPwd } });
    },
    onSuccess: () => {
      toast.success("Senha redefinida");
      setOpenPwd(null);
      setNewPwd("");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  if (!isAdmin) {
    return <div className="p-8 text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase();
    return !q || r.nome.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  return (
    <PageShell
      icon={Users}
      title="Usuários"
      subtitle="Gestão de acessos e perfis"
      search={search}
      onSearch={setSearch}
      canAdd
      addLabel="Novo usuário"
      onAdd={() => setOpenNew(true)}
    >
      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Motorista vinculado</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-xs">{r.email}</TableCell>
                  <TableCell>
                    <Select value={r.role ?? ""} onValueChange={(v) => changeRole.mutate({ user_id: r.id, role: v as Role })}>
                      <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="administrador">Administrador</SelectItem>
                        <SelectItem value="financeiro">Financeiro</SelectItem>
                        <SelectItem value="gestor">Gestor</SelectItem>
                        <SelectItem value="motorista">Motorista</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">{r.motorista_nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={r.ativo} onCheckedChange={() => toggleAtivo.mutate(r)} />
                      <Badge variant={r.ativo ? "default" : "outline"}>{r.ativo ? "Ativo" : "Inativo"}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setOpenPwd(r)} title="Redefinir senha">
                      <KeyRound className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <F label="Nome *"><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></F>
            <F label="E-mail *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></F>
            <F label="Telefone"><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></F>
            <F label="Senha *"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></F>
            <F label="Perfil *">
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="administrador">Administrador</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                  <SelectItem value="gestor">Gestor</SelectItem>
                  <SelectItem value="motorista">Motorista</SelectItem>
                </SelectContent>
              </Select>
            </F>
            {form.role === "motorista" && (
              <F label="Vincular a motorista cadastrado">
                <Select value={form.motorista_id || "none"} onValueChange={(v) => setForm({ ...form, motorista_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nenhum —</SelectItem>
                    {motoristasLivres.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openPwd} onOpenChange={(v) => !v && setOpenPwd(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Redefinir senha — {openPwd?.nome}</DialogTitle></DialogHeader>
          <F label="Nova senha *">
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          </F>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPwd(null)}>Cancelar</Button>
            <Button onClick={() => resetMut.mutate()} disabled={resetMut.isPending}>
              {resetMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Redefinir
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
