import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Users, KeyRound, Loader2, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/crud/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createUser, resetUserPassword, updateUser } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/app/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — G3 Expresso" }] }),
  component: UsuariosPage,
});

type Role = "administrador" | "financeiro" | "gestor" | "motorista";
type Filter = "todos" | "vinculados" | "nao_vinculados";

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
  const [filter, setFilter] = useState<Filter>("todos");
  const [openNew, setOpenNew] = useState(false);
  const [openEdit, setOpenEdit] = useState<Row | null>(null);
  const [openPwd, setOpenPwd] = useState<Row | null>(null);

  const createFn = useServerFn(createUser);
  const updateFn = useServerFn(updateUser);
  const resetFn = useServerFn(resetUserPassword);

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

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["usuarios-admin"] });
    qc.invalidateQueries({ queryKey: ["motoristas-livres"] });
  };

  // ------ Novo usuário
  const [form, setForm] = useState<{
    email: string; password: string; nome: string; telefone: string; role: Role; motorista_id: string;
  }>({ email: "", password: "", nome: "", telefone: "", role: "motorista", motorista_id: "" });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!form.email || !form.password || !form.nome) throw new Error("Preencha nome, e-mail e senha");
      if (form.password.length < 6) throw new Error("Senha mínima de 6 caracteres");
      if (form.role === "motorista" && !form.motorista_id) throw new Error("Selecione um motorista para vincular");
      return createFn({
        data: {
          email: form.email.trim(),
          password: form.password,
          nome: form.nome.trim(),
          telefone: form.telefone || null,
          role: form.role,
          motorista_id: form.role === "motorista" ? form.motorista_id : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Usuário criado");
      invalidateAll();
      setOpenNew(false);
      setForm({ email: "", password: "", nome: "", telefone: "", role: "motorista", motorista_id: "" });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  // ------ Edição
  const [edit, setEdit] = useState<{
    nome: string; email: string; role: Role; ativo: boolean; motorista_id: string;
  } | null>(null);
  const [confirmRemoveLink, setConfirmRemoveLink] = useState<null | (() => void)>(null);

  function startEdit(r: Row) {
    setEdit({
      nome: r.nome,
      email: r.email,
      role: (r.role ?? "motorista") as Role,
      ativo: r.ativo,
      motorista_id: r.motorista_id ?? "",
    });
    setOpenEdit(r);
  }

  const editMotoristasOptions = useMemo(() => {
    if (!openEdit || !edit) return motoristasLivres;
    // Se o usuário já é motorista vinculado, inclui o próprio motorista na lista
    if (openEdit.motorista_id && openEdit.motorista_nome) {
      const already = motoristasLivres.find((m) => m.id === openEdit.motorista_id);
      if (!already) {
        return [
          { id: openEdit.motorista_id, nome: openEdit.motorista_nome, user_id: openEdit.id },
          ...motoristasLivres,
        ];
      }
    }
    return motoristasLivres;
  }, [motoristasLivres, openEdit, edit]);

  const updateMut = useMutation({
    mutationFn: async (payload: {
      user_id: string;
      nome?: string; email?: string; role?: Role; ativo?: boolean;
      motorista_id?: string | null;
    }) => updateFn({ data: payload }),
    onSuccess: () => {
      toast.success("Alterações salvas");
      invalidateAll();
      setOpenEdit(null);
      setEdit(null);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  function handleSaveEdit() {
    if (!openEdit || !edit) return;
    if (!edit.nome.trim()) return toast.error("Informe o nome");
    if (!edit.email.trim()) return toast.error("Informe o e-mail");
    if (edit.role === "motorista" && !edit.motorista_id) {
      return toast.error("Selecione um motorista para vincular");
    }

    const wasMotorista = openEdit.role === "motorista";
    const nowOther = edit.role !== "motorista";
    const hadLink = !!openEdit.motorista_id;

    // Se mudou de motorista para outro perfil e existe vínculo → perguntar
    if (wasMotorista && nowOther && hadLink) {
      setConfirmRemoveLink(() => () => {
        submitEdit(true);
      });
      return;
    }
    submitEdit(false);
  }

  function submitEdit(removeLink: boolean) {
    if (!openEdit || !edit) return;
    const payload: Parameters<typeof updateMut.mutate>[0] = { user_id: openEdit.id };
    if (edit.nome !== openEdit.nome) payload.nome = edit.nome.trim();
    if (edit.email !== openEdit.email) payload.email = edit.email.trim();
    if (edit.role !== openEdit.role) payload.role = edit.role;
    if (edit.ativo !== openEdit.ativo) payload.ativo = edit.ativo;

    if (edit.role === "motorista") {
      const current = openEdit.motorista_id ?? "";
      if (edit.motorista_id !== current) payload.motorista_id = edit.motorista_id || null;
    } else if (removeLink) {
      payload.motorista_id = null;
    }
    setConfirmRemoveLink(null);
    updateMut.mutate(payload);
  }

  // ------ Toggle ativo direto
  const toggleAtivo = useMutation({
    mutationFn: async (row: Row) => updateFn({ data: { user_id: row.id, ativo: !row.ativo } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios-admin"] });
      toast.success("Status alterado");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  // ------ Senha
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
    const matchQ = !q || r.nome.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    if (!matchQ) return false;
    if (filter === "vinculados") return !!r.motorista_id;
    if (filter === "nao_vinculados") return !r.motorista_id;
    return true;
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
      <div className="mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="vinculados">Vinculados</TabsTrigger>
            <TabsTrigger value="nao_vinculados">Não vinculados</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
                <TableHead>Motorista Vinculado</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.nome}</TableCell>
                  <TableCell className="text-xs">{r.email}</TableCell>
                  <TableCell>
                    {r.role ? (
                      <Badge variant="outline" className="capitalize">{r.role}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.motorista_nome ? (
                      r.motorista_nome
                    ) : (
                      <span className="text-muted-foreground">Não vinculado</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch checked={r.ativo} onCheckedChange={() => toggleAtivo.mutate(r)} />
                      <Badge variant={r.ativo ? "default" : "outline"}>{r.ativo ? "Ativo" : "Inativo"}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(r)} title="Editar">
                      <Pencil className="size-4" />
                    </Button>
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

      {/* Novo usuário */}
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
              <F label="Motorista Vinculado *">
                <Select value={form.motorista_id} onValueChange={(v) => setForm({ ...form, motorista_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
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

      {/* Editar usuário */}
      <Dialog open={!!openEdit} onOpenChange={(v) => { if (!v) { setOpenEdit(null); setEdit(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>Altere os dados, perfil e vínculo do usuário.</DialogDescription>
          </DialogHeader>
          {edit && openEdit && (
            <div className="grid gap-4">
              <F label="Nome *"><Input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></F>
              <F label="E-mail *"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></F>
              <F label="Perfil *">
                <Select
                  value={edit.role}
                  onValueChange={(v) => setEdit({ ...edit, role: v as Role, motorista_id: v === "motorista" ? edit.motorista_id : "" })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="administrador">Administrador</SelectItem>
                    <SelectItem value="financeiro">Financeiro</SelectItem>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="motorista">Motorista</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              {edit.role === "motorista" && (
                <F label="Motorista Vinculado *">
                  <Select value={edit.motorista_id} onValueChange={(v) => setEdit({ ...edit, motorista_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {editMotoristasOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </F>
              )}
              <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
                <div>
                  <div className="text-sm font-medium">Status</div>
                  <div className="text-xs text-muted-foreground">
                    Usuários inativos não conseguem acessar o sistema.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={edit.ativo} onCheckedChange={(v) => setEdit({ ...edit, ativo: v })} />
                  <Badge variant={edit.ativo ? "default" : "outline"}>{edit.ativo ? "Ativo" : "Inativo"}</Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenEdit(null); setEdit(null); }}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateMut.isPending}>
              {updateMut.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação: remover vínculo ao trocar de motorista para outro perfil */}
      <AlertDialog open={!!confirmRemoveLink} onOpenChange={(v) => !v && setConfirmRemoveLink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vínculo com motorista?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está alterando o perfil deste usuário e ele ainda possui um motorista vinculado.
              Deseja remover apenas o vínculo? O motorista, viagens, abastecimentos, despesas e
              histórico serão mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmRemoveLink(null)}>Manter vínculo</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmRemoveLink?.()}>Remover vínculo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Redefinir senha */}
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
