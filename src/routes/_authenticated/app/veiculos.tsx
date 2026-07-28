import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, Pencil, Trash2, Loader2 } from "lucide-react";

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

export const Route = createFileRoute("/_authenticated/app/veiculos")({
  head: () => ({ meta: [{ title: "Veículos — G3 Expresso" }] }),
  component: VeiculosPage,
});

type Veiculo = {
  id: string;
  placa: string;
  modelo: string;
  marca: string | null;
  ano: number | null;
  tipo: string;
  renavam: string | null;
  chassi: string | null;
  capacidade_kg: number | null;
  cor: string | null;
  ativo: boolean;
  observacoes: string | null;
  provisao_manutencao_km: number | null;
  provisao_pneus_km: number | null;
};


const TIPOS = ["cavalo", "carreta", "truck", "toco", "van", "utilitario", "outro"];
const emptyForm: Partial<Veiculo> = { placa: "", modelo: "", tipo: "outro", ativo: true };

function VeiculosPage() {
  const { role } = useAuth();
  const canWrite = role === "administrador" || role === "gestor" || role === "financeiro";
  const isAdmin = role === "administrador";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Veiculo>>(emptyForm);

  const { data = [], isLoading } = useQuery({
    queryKey: ["veiculos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("veiculos").select("*").order("placa");
      if (error) throw error;
      return data as Veiculo[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const placa = (form.placa ?? "").toUpperCase().trim();
      const modelo = (form.modelo ?? "").trim();
      if (!placa || !modelo) throw new Error("Placa e modelo são obrigatórios");
      const payload = {
        placa,
        modelo,
        marca: form.marca || null,
        ano: form.ano ? Number(form.ano) : null,
        tipo: (form.tipo ?? "outro") as "cavalo" | "carreta" | "truck" | "toco" | "van" | "utilitario" | "outro",
        renavam: form.renavam || null,
        chassi: form.chassi || null,
        capacidade_kg: form.capacidade_kg ? Number(form.capacidade_kg) : null,
        cor: form.cor || null,
        ativo: form.ativo ?? true,
        observacoes: form.observacoes || null,
        provisao_manutencao_km: form.provisao_manutencao_km ? Number(form.provisao_manutencao_km) : null,
        provisao_pneus_km: form.provisao_pneus_km ? Number(form.provisao_pneus_km) : null,
      };

      if (form.id) {
        const { error } = await supabase.from("veiculos").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("veiculos").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Veículo atualizado" : "Veículo cadastrado");
      qc.invalidateQueries({ queryKey: ["veiculos"] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("veiculos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo removido");
      qc.invalidateQueries({ queryKey: ["veiculos"] });
    },
    onError: (e: Error) => toast.error("Erro ao remover", { description: e.message }),
  });

  const filtered = data.filter((v) => {
    const q = search.toLowerCase();
    return !q || v.placa.toLowerCase().includes(q) || v.modelo.toLowerCase().includes(q) || (v.marca ?? "").toLowerCase().includes(q);
  });

  return (
    <PageShell
      icon={Truck}
      title="Veículos"
      subtitle="Cadastro da frota"
      search={search}
      onSearch={setSearch}
      canAdd={canWrite}
      addLabel="Novo veículo"
      onAdd={() => {
        setForm(emptyForm);
        setOpen(true);
      }}
    >
      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="size-6 animate-spin text-brand" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Nenhum veículo cadastrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Capacidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono font-semibold">{v.placa}</TableCell>
                  <TableCell>
                    {v.modelo}
                    {v.marca && <span className="ml-1 text-muted-foreground">· {v.marca}</span>}
                  </TableCell>
                  <TableCell className="capitalize">{v.tipo}</TableCell>
                  <TableCell>{v.ano ?? "—"}</TableCell>
                  <TableCell>{v.capacidade_kg ? `${v.capacidade_kg} kg` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={v.ativo ? "default" : "outline"}>{v.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canWrite && (
                      <Button variant="ghost" size="icon" onClick={() => { setForm(v); setOpen(true); }}>
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon" onClick={() => confirm(`Excluir ${v.placa}?`) && del.mutate(v.id)}>
                        <Trash2 className="size-4" />
                      </Button>
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
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar veículo" : "Novo veículo"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <F label="Placa *"><Input value={form.placa ?? ""} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })} placeholder="ABC1D23" /></F>
            <F label="Tipo">
              <Select value={form.tipo ?? "outro"} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Modelo *"><Input value={form.modelo ?? ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></F>
            <F label="Marca"><Input value={form.marca ?? ""} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></F>
            <F label="Ano"><Input type="number" value={form.ano ?? ""} onChange={(e) => setForm({ ...form, ano: e.target.value ? Number(e.target.value) : null })} /></F>
            <F label="Cor"><Input value={form.cor ?? ""} onChange={(e) => setForm({ ...form, cor: e.target.value })} /></F>
            <F label="Renavam"><Input value={form.renavam ?? ""} onChange={(e) => setForm({ ...form, renavam: e.target.value })} /></F>
            <F label="Chassi"><Input value={form.chassi ?? ""} onChange={(e) => setForm({ ...form, chassi: e.target.value })} /></F>
            <F label="Capacidade (kg)"><Input type="number" value={form.capacidade_kg ?? ""} onChange={(e) => setForm({ ...form, capacidade_kg: e.target.value ? Number(e.target.value) : null })} /></F>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativo</Label>
            </div>
            <div className="md:col-span-2">
              <F label="Observações"><Textarea rows={2} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} /></F>
            </div>
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
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
