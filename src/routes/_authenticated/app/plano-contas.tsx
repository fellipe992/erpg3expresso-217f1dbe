import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, Plus, Pencil, Power, PowerOff, Loader2, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/app/plano-contas")({
  head: () => ({ meta: [{ title: "Plano de Contas — G3 Expresso" }] }),
  component: PlanoContasPage,
});

type Tipo = "receita" | "despesa" | "outros";
type Grupo = { id: string; codigo: string; nome: string; tipo: Tipo; ordem: number; ativo: boolean };
type Subgrupo = { id: string; grupo_id: string; codigo: string; nome: string; ordem: number; ativo: boolean };
type Conta = { id: string; subgrupo_id: string; codigo: string; nome: string; tipo: Tipo; centro_custo: string | null; descricao: string | null; ativo: boolean; updated_at: string };
type Centro = { id: string; nome: string; descricao: string | null; ativo: boolean };
type Audit = { id: string; entidade: string; acao: string; descricao: string | null; created_at: string; usuario_id: string | null };

function PlanoContasPage() {
  const { role } = useAuth();
  const isAdmin = role === "administrador";

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
          <BookOpen className="size-5 text-brand" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Plano de Contas</h1>
          <p className="text-sm text-muted-foreground">Grupos, subgrupos, contas financeiras e centros de custo</p>
        </div>
      </div>

      {!isAdmin && (
        <Card className="p-4 text-sm text-muted-foreground">Apenas o administrador pode editar. Consulta liberada abaixo.</Card>
      )}

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="subgrupos">Subgrupos</TabsTrigger>
          <TabsTrigger value="contas">Contas</TabsTrigger>
          <TabsTrigger value="centros">Centros de custo</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos" className="mt-4"><GruposTab canWrite={isAdmin} /></TabsContent>
        <TabsContent value="subgrupos" className="mt-4"><SubgruposTab canWrite={isAdmin} /></TabsContent>
        <TabsContent value="contas" className="mt-4"><ContasTab canWrite={isAdmin} /></TabsContent>
        <TabsContent value="centros" className="mt-4"><CentrosTab canWrite={isAdmin} /></TabsContent>
        <TabsContent value="auditoria" className="mt-4"><AuditoriaTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------- GRUPOS ----------------
function GruposTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Grupo>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["plano-grupos-full"],
    queryFn: async () => {
      const { data } = await supabase.from("plano_grupos").select("*").order("ordem");
      return (data ?? []) as Grupo[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome?.trim()) throw new Error("Nome obrigatório");
      if (!form.tipo) throw new Error("Tipo obrigatório");
      const codigo = form.codigo?.trim() || String((data.length + 1));
      const payload = { codigo, nome: form.nome.trim(), tipo: form.tipo, ordem: form.ordem ?? data.length + 1, ativo: form.ativo ?? true };
      if (form.id) {
        const { error } = await supabase.from("plano_grupos").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plano_grupos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Grupo salvo"); qc.invalidateQueries({ queryKey: ["plano-grupos-full"] }); qc.invalidateQueries({ queryKey: ["plano-grupos-lite"] }); setOpen(false); setForm({}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (g: Grupo) => {
      const { error } = await supabase.from("plano_grupos").update({ ativo: !g.ativo }).eq("id", g.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["plano-grupos-full"] }); qc.invalidateQueries({ queryKey: ["plano-grupos-lite"] }); },
  });

  return (
    <>
      <div className="mb-3 flex justify-end">
        {canWrite && <Button onClick={() => { setForm({ tipo: "despesa" }); setOpen(true); }}><Plus className="mr-2 size-4" /> Novo grupo</Button>}
      </div>
      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-brand" /></div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-mono text-xs">{g.codigo}</TableCell>
                  <TableCell>{g.nome}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{g.tipo}</Badge></TableCell>
                  <TableCell>{g.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {canWrite && <>
                      <Button size="icon" variant="ghost" onClick={() => { setForm(g); setOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => toggle.mutate(g)} title={g.ativo ? "Inativar" : "Reativar"}>
                        {g.ativo ? <PowerOff className="size-4" /> : <Power className="size-4 text-brand" />}
                      </Button>
                    </>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Editar grupo" : "Novo grupo"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Código (opcional)"><Input value={form.codigo ?? ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ex.: 1" /></Field>
            <Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
            <Field label="Tipo *">
              <Select value={form.tipo ?? "despesa"} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Ordem"><Input type="number" value={form.ordem ?? ""} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------- SUBGRUPOS ----------------
function SubgruposTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Subgrupo>>({});
  const [filterGrupo, setFilterGrupo] = useState<string>("todos");

  const { data: grupos = [] } = useQuery({
    queryKey: ["plano-grupos-full"],
    queryFn: async () => {
      const { data } = await supabase.from("plano_grupos").select("*").order("ordem");
      return (data ?? []) as Grupo[];
    },
  });
  const { data: subgrupos = [], isLoading } = useQuery({
    queryKey: ["plano-subgrupos-full"],
    queryFn: async () => {
      const { data } = await supabase.from("plano_subgrupos").select("*").order("codigo");
      return (data ?? []) as Subgrupo[];
    },
  });

  const filtrados = useMemo(() => subgrupos.filter((s) => filterGrupo === "todos" || s.grupo_id === filterGrupo), [subgrupos, filterGrupo]);
  const grupoMap = useMemo(() => Object.fromEntries(grupos.map((g) => [g.id, g])), [grupos]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome?.trim() || !form.grupo_id) throw new Error("Preencha grupo e nome");
      const g = grupoMap[form.grupo_id];
      const contagem = subgrupos.filter((s) => s.grupo_id === form.grupo_id).length;
      const codigo = form.codigo?.trim() || `${g.codigo}.${contagem + 1}`;
      const payload = { grupo_id: form.grupo_id, codigo, nome: form.nome.trim(), ordem: form.ordem ?? contagem + 1, ativo: form.ativo ?? true };
      if (form.id) {
        const { error } = await supabase.from("plano_subgrupos").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plano_subgrupos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Subgrupo salvo"); qc.invalidateQueries({ queryKey: ["plano-subgrupos-full"] }); qc.invalidateQueries({ queryKey: ["plano-subgrupos-by-grupo"] }); setOpen(false); setForm({}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (s: Subgrupo) => {
      const { error } = await supabase.from("plano_subgrupos").update({ ativo: !s.ativo }).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plano-subgrupos-full"] }); qc.invalidateQueries({ queryKey: ["plano-subgrupos-by-grupo"] }); },
  });

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Label className="text-xs">Filtrar por grupo:</Label>
        <Select value={filterGrupo} onValueChange={setFilterGrupo}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.codigo} · {g.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canWrite && <Button onClick={() => { setForm({}); setOpen(true); }}><Plus className="mr-2 size-4" /> Novo subgrupo</Button>}
      </div>
      <Card>
        {isLoading ? <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-brand" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Grupo</TableHead><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtrados.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.codigo}</TableCell>
                  <TableCell>{grupoMap[s.grupo_id]?.nome ?? "—"}</TableCell>
                  <TableCell>{s.nome}</TableCell>
                  <TableCell>{s.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {canWrite && <>
                      <Button size="icon" variant="ghost" onClick={() => { setForm(s); setOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => toggle.mutate(s)}>{s.ativo ? <PowerOff className="size-4" /> : <Power className="size-4 text-brand" />}</Button>
                    </>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Editar subgrupo" : "Novo subgrupo"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Grupo *">
              <Select value={form.grupo_id ?? ""} onValueChange={(v) => setForm({ ...form, grupo_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.codigo} · {g.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Código (opcional)"><Input value={form.codigo ?? ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></Field>
            <Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
            <Field label="Ordem"><Input type="number" value={form.ordem ?? ""} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------- CONTAS ----------------
function ContasTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Conta> & { grupo_id?: string }>({});
  const [filterGrupo, setFilterGrupo] = useState<string>("todos");
  const [search, setSearch] = useState("");

  const { data: grupos = [] } = useQuery({
    queryKey: ["plano-grupos-full"],
    queryFn: async () => (await supabase.from("plano_grupos").select("*").order("ordem")).data as Grupo[] ?? [],
  });
  const { data: subgrupos = [] } = useQuery({
    queryKey: ["plano-subgrupos-full"],
    queryFn: async () => (await supabase.from("plano_subgrupos").select("*").order("codigo")).data as Subgrupo[] ?? [],
  });
  const { data: contas = [], isLoading } = useQuery({
    queryKey: ["plano-contas-full"],
    queryFn: async () => (await supabase.from("plano_contas").select("*").order("codigo")).data as Conta[] ?? [],
  });
  const { data: centros = [] } = useQuery({
    queryKey: ["centros-custo-full"],
    queryFn: async () => (await supabase.from("centros_custo").select("*").eq("ativo", true).order("nome")).data as Centro[] ?? [],
  });

  const subMap = useMemo(() => Object.fromEntries(subgrupos.map((s) => [s.id, s])), [subgrupos]);
  const grupoMap = useMemo(() => Object.fromEntries(grupos.map((g) => [g.id, g])), [grupos]);

  const filtradas = useMemo(() => {
    return contas.filter((c) => {
      if (filterGrupo !== "todos" && subMap[c.subgrupo_id]?.grupo_id !== filterGrupo) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.nome.toLowerCase().includes(q) || c.codigo.includes(q);
      }
      return true;
    });
  }, [contas, filterGrupo, subMap, search]);

  const subsDoGrupo = useMemo(() => subgrupos.filter((s) => s.grupo_id === form.grupo_id && s.ativo), [subgrupos, form.grupo_id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome?.trim() || !form.subgrupo_id || !form.tipo) throw new Error("Preencha nome, subgrupo e tipo");
      const sub = subMap[form.subgrupo_id];
      const contagem = contas.filter((c) => c.subgrupo_id === form.subgrupo_id).length;
      const codigo = form.codigo?.trim() || `${sub.codigo}.${String(contagem + 1).padStart(3, "0")}`;
      const payload = { subgrupo_id: form.subgrupo_id, codigo, nome: form.nome.trim(), tipo: form.tipo, centro_custo: form.centro_custo || null, descricao: form.descricao || null, ativo: form.ativo ?? true };
      if (form.id) {
        const { error } = await supabase.from("plano_contas").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("plano_contas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Conta salva"); qc.invalidateQueries({ queryKey: ["plano-contas-full"] }); qc.invalidateQueries({ queryKey: ["plano-contas-by-sub"] }); setOpen(false); setForm({}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (c: Conta) => {
      const { error } = await supabase.from("plano_contas").update({ ativo: !c.ativo }).eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plano-contas-full"] }),
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar conta..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <Select value={filterGrupo} onValueChange={setFilterGrupo}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Grupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os grupos</SelectItem>
            {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.codigo} · {g.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canWrite && <Button onClick={() => { setForm({ tipo: "despesa" }); setOpen(true); }}><Plus className="mr-2 size-4" /> Nova conta</Button>}
      </div>
      <Card>
        {isLoading ? <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-brand" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Hierarquia</TableHead><TableHead>Tipo</TableHead><TableHead>Centro de custo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtradas.map((c) => {
                const sub = subMap[c.subgrupo_id];
                const g = sub ? grupoMap[sub.grupo_id] : undefined;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{g?.nome} → {sub?.nome}</TableCell>
                    <TableCell><Badge variant={c.tipo === "receita" ? "default" : "outline"} className="capitalize">{c.tipo}</Badge></TableCell>
                    <TableCell className="text-xs">{c.centro_custo ?? "—"}</TableCell>
                    <TableCell>{c.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                    <TableCell className="text-right">
                      {canWrite && <>
                        <Button size="icon" variant="ghost" onClick={() => { setForm({ ...c, grupo_id: sub?.grupo_id }); setOpen(true); }}><Pencil className="size-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => toggle.mutate(c)}>{c.ativo ? <PowerOff className="size-4" /> : <Power className="size-4 text-brand" />}</Button>
                      </>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Editar conta" : "Nova conta"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Grupo *">
              <Select value={form.grupo_id ?? ""} onValueChange={(v) => setForm({ ...form, grupo_id: v, subgrupo_id: undefined })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{grupos.filter((g) => g.ativo).map((g) => <SelectItem key={g.id} value={g.id}>{g.codigo} · {g.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Subgrupo *">
              <Select value={form.subgrupo_id ?? ""} onValueChange={(v) => setForm({ ...form, subgrupo_id: v })} disabled={!form.grupo_id}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{subsDoGrupo.map((s) => <SelectItem key={s.id} value={s.id}>{s.codigo} · {s.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Código (opcional)"><Input value={form.codigo ?? ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></Field>
            <Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
            <Field label="Tipo *">
              <Select value={form.tipo ?? "despesa"} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Centro de custo">
              <Select value={form.centro_custo ?? "__none"} onValueChange={(v) => setForm({ ...form, centro_custo: v === "__none" ? null : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {centros.map((c) => <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Descrição"><Textarea rows={2} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------- CENTROS DE CUSTO ----------------
function CentrosTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Centro>>({});

  const { data = [], isLoading } = useQuery({
    queryKey: ["centros-custo-full"],
    queryFn: async () => (await supabase.from("centros_custo").select("*").order("nome")).data as Centro[] ?? [],
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.nome?.trim()) throw new Error("Nome obrigatório");
      const payload = { nome: form.nome.trim(), descricao: form.descricao || null, ativo: form.ativo ?? true };
      if (form.id) {
        const { error } = await supabase.from("centros_custo").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("centros_custo").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Centro salvo"); qc.invalidateQueries({ queryKey: ["centros-custo-full"] }); setOpen(false); setForm({}); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (c: Centro) => { const { error } = await supabase.from("centros_custo").update({ ativo: !c.ativo }).eq("id", c.id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["centros-custo-full"] }),
  });

  return (
    <>
      <div className="mb-3 flex justify-end">{canWrite && <Button onClick={() => { setForm({}); setOpen(true); }}><Plus className="mr-2 size-4" /> Novo centro</Button>}</div>
      <Card>
        {isLoading ? <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-brand" /></div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>Descrição</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.descricao ?? "—"}</TableCell>
                  <TableCell>{c.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {canWrite && <>
                      <Button size="icon" variant="ghost" onClick={() => { setForm(c); setOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => toggle.mutate(c)}>{c.ativo ? <PowerOff className="size-4" /> : <Power className="size-4 text-brand" />}</Button>
                    </>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "Editar centro" : "Novo centro"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <Field label="Nome *"><Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></Field>
            <Field label="Descrição"><Textarea rows={2} value={form.descricao ?? ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------- AUDITORIA ----------------
function AuditoriaTab() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["plano-auditoria"],
    queryFn: async () => (await supabase.from("plano_auditoria").select("*").order("created_at", { ascending: false }).limit(200)).data as Audit[] ?? [],
  });
  return (
    <Card>
      {isLoading ? <div className="grid place-items-center p-8"><Loader2 className="size-5 animate-spin text-brand" /></div> : data.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Nenhum registro ainda.</div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Data/Hora</TableHead><TableHead>Entidade</TableHead><TableHead>Ação</TableHead><TableHead>Descrição</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs">{new Date(a.created_at).toLocaleString("pt-BR")}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{a.entidade}</Badge></TableCell>
                <TableCell>
                  <Badge variant={a.acao === "criar" ? "default" : a.acao === "inativar" ? "destructive" : "outline"} className="capitalize">
                    <ShieldCheck className="mr-1 size-3" /> {a.acao}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{a.descricao ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
