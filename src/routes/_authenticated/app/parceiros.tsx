import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Handshake, Loader2, Check, X, Eye, Truck, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { aprovarParceiro, rejeitarParceiro } from "@/lib/parceiros.functions";
import { PageShell } from "@/components/crud/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/parceiros")({
  head: () => ({
    meta: [
      { title: "Captação de Parceiros — G3 Expresso" },
      { name: "description", content: "Receba, analise e aprove cadastros de motoristas parceiros enviados pelo site." },
      { property: "og:title", content: "Captação de Parceiros — G3 Expresso" },
      { property: "og:description", content: "Aprovação de parceiros com criação automática de motorista e veículo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParceirosPage,
});

type Candidatura = {
  id: string;
  nome: string;
  documento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  tipo_veiculo: string | null;
  marca_modelo: string | null;
  ano: number | null;
  placa: string | null;
  capacidade_kg: number | null;
  carroceria: string | null;
  tem_antt: boolean | null;
  numero_antt: string | null;
  regioes: string | null;
  tipos_carga: string | null;
  experiencia: string | null;
  sobre: string | null;
  status: string;
  motivo_rejeicao: string | null;
  motorista_id: string | null;
  veiculo_id: string | null;
  created_at: string;
};

const statusVariant: Record<string, "default" | "outline" | "secondary" | "destructive"> = {
  pendente: "secondary",
  aprovado: "default",
  rejeitado: "destructive",
};

function ParceirosPage() {
  const { role } = useAuth();
  const canWrite = role === "administrador" || role === "gestor" || role === "financeiro";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("pendente");
  const [detalhe, setDetalhe] = useState<Candidatura | null>(null);
  const [criarVeiculo, setCriarVeiculo] = useState(true);
  const [motivo, setMotivo] = useState("");

  const aprovar = useServerFn(aprovarParceiro);
  const rejeitar = useServerFn(rejeitarParceiro);

  const { data = [], isLoading } = useQuery({
    queryKey: ["parceiros-candidaturas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros_candidaturas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Candidatura[];
    },
    refetchInterval: 60_000,
  });

  const aprovarMut = useMutation({
    mutationFn: async (c: Candidatura) => aprovar({ data: { id: c.id, criarVeiculo } }),
    onSuccess: (r: { veiculo_id: string | null }) => {
      toast.success("Parceiro aprovado", {
        description: r.veiculo_id ? "Motorista e veículo criados no sistema." : "Motorista criado no sistema.",
      });
      qc.invalidateQueries({ queryKey: ["parceiros-candidaturas"] });
      qc.invalidateQueries({ queryKey: ["motoristas"] });
      qc.invalidateQueries({ queryKey: ["veiculos"] });
      setDetalhe(null);
    },
    onError: (e: Error) => toast.error("Erro ao aprovar", { description: e.message }),
  });

  const rejeitarMut = useMutation({
    mutationFn: async (c: Candidatura) => rejeitar({ data: { id: c.id, motivo: motivo || null } }),
    onSuccess: () => {
      toast.success("Candidatura rejeitada");
      qc.invalidateQueries({ queryKey: ["parceiros-candidaturas"] });
      setDetalhe(null);
      setMotivo("");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const filtered = data.filter((c) => {
    if (tab !== "todos" && c.status !== tab) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [c.nome, c.documento, c.placa, c.cidade, c.email, c.telefone, c.whatsapp]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const pendentes = data.filter((c) => c.status === "pendente").length;

  return (
    <PageShell
      icon={Handshake}
      title="Captação de Parceiros"
      subtitle={`Cadastros recebidos pelo site · ${pendentes} pendente(s)`}
      search={search}
      onSearch={setSearch}
      canAdd={false}
      onAdd={() => {}}
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pendente">Pendentes</TabsTrigger>
          <TabsTrigger value="aprovado">Aprovados</TabsTrigger>
          <TabsTrigger value="rejeitado">Rejeitados</TabsTrigger>
          <TabsTrigger value="todos">Todos</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        {isLoading ? (
          <div className="grid place-items-center p-12"><Loader2 className="size-6 animate-spin text-brand" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhuma candidatura nesta situação.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recebido</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-xs">{c.whatsapp ?? c.telefone ?? c.email ?? "—"}</TableCell>
                  <TableCell className="text-xs">{[c.cidade, c.uf].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {c.placa ? `${c.placa} · ${c.marca_modelo ?? c.tipo_veiculo ?? ""}` : (c.tipo_veiculo ?? "—")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[c.status] ?? "outline"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setDetalhe(c); setCriarVeiculo(!!c.placa); setMotivo(""); }}>
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{detalhe?.nome}</DialogTitle></DialogHeader>
          {detalhe && (
            <div className="space-y-5 text-sm">
              <Section title="Dados pessoais">
                <Item label="CPF/CNPJ" value={detalhe.documento} />
                <Item label="Telefone" value={detalhe.telefone} />
                <Item label="WhatsApp" value={detalhe.whatsapp} />
                <Item label="E-mail" value={detalhe.email} />
                <Item label="Cidade" value={detalhe.cidade} />
                <Item label="UF" value={detalhe.uf} />
              </Section>
              <Section title="Veículo">
                <Item label="Tipo" value={detalhe.tipo_veiculo} />
                <Item label="Marca/Modelo" value={detalhe.marca_modelo} />
                <Item label="Ano" value={detalhe.ano} />
                <Item label="Placa" value={detalhe.placa} />
                <Item label="Capacidade (kg)" value={detalhe.capacidade_kg} />
                <Item label="Carroceria" value={detalhe.carroceria} />
              </Section>
              <Section title="Operacional">
                <Item label="Possui ANTT" value={detalhe.tem_antt === null ? null : detalhe.tem_antt ? "Sim" : "Não"} />
                <Item label="Nº ANTT" value={detalhe.numero_antt} />
                <Item label="Regiões" value={detalhe.regioes} />
                <Item label="Tipos de carga" value={detalhe.tipos_carga} />
              </Section>
              {(detalhe.experiencia || detalhe.sobre) && (
                <div className="rounded-lg border p-3 text-xs text-muted-foreground">
                  {detalhe.experiencia && <p><strong>Experiência:</strong> {detalhe.experiencia}</p>}
                  {detalhe.sobre && <p className="mt-1"><strong>Sobre:</strong> {detalhe.sobre}</p>}
                </div>
              )}

              {detalhe.status === "aprovado" && (
                <div className="flex flex-wrap gap-3 rounded-lg bg-brand-subtle p-3 text-xs">
                  <span className="inline-flex items-center gap-1"><User className="size-3.5" /> Motorista criado</span>
                  {detalhe.veiculo_id && <span className="inline-flex items-center gap-1"><Truck className="size-3.5" /> Veículo criado (agregado)</span>}
                </div>
              )}
              {detalhe.status === "rejeitado" && detalhe.motivo_rejeicao && (
                <p className="text-xs text-destructive">Motivo: {detalhe.motivo_rejeicao}</p>
              )}

              {canWrite && detalhe.status === "pendente" && (
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={criarVeiculo} onCheckedChange={setCriarVeiculo} disabled={!detalhe.placa} />
                    <Label className="text-xs">
                      Cadastrar veículo como agregado {detalhe.placa ? `(${detalhe.placa})` : "(sem placa informada)"}
                    </Label>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Motivo (em caso de rejeição)</Label>
                    <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" />
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetalhe(null)}>Fechar</Button>
            {canWrite && detalhe?.status === "pendente" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => detalhe && rejeitarMut.mutate(detalhe)}
                  disabled={rejeitarMut.isPending}
                >
                  <X className="mr-2 size-4" /> Rejeitar
                </Button>
                <Button onClick={() => detalhe && aprovarMut.mutate(detalhe)} disabled={aprovarMut.isPending}>
                  {aprovarMut.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
                  Aprovar e cadastrar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="grid gap-2 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}
