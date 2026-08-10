import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquarePlus, Send, MessagesSquare, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/app/avisos")({
  head: () => ({
    meta: [
      { title: "Avisos e comunicação — G3 Expresso" },
      {
        name: "description",
        content:
          "Canal direto entre motoristas e a operação da G3 Expresso para avisos, ocorrências e ajustes fora da viagem.",
      },
      { property: "og:title", content: "Avisos e comunicação — G3 Expresso" },
      {
        property: "og:description",
        content: "Abra e acompanhe avisos entre motoristas e a operação da G3 Expresso.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AvisosPage,
});

const CATEGORIAS = [
  { value: "geral", label: "Aviso geral" },
  { value: "veiculo", label: "Problema no veículo" },
  { value: "carga", label: "Carga / entrega" },
  { value: "atraso", label: "Atraso" },
  { value: "disponibilidade", label: "Disponibilidade / reserva" },
  { value: "urgente", label: "Urgente" },
];

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em tratamento",
  resolvido: "Resolvido",
};

type Aviso = {
  id: string;
  created_by: string;
  categoria: string;
  assunto: string;
  mensagem: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function AvisosPage() {
  const { user, role } = useAuth();
  const isStaff = role === "administrador" || role === "gestor" || role === "financeiro";
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);

  const { data: avisos = [], isLoading } = useQuery({
    queryKey: ["avisos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos")
        .select("id, created_by, categoria, assunto, mensagem, status, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Aviso[];
    },
  });

  const { data: autores = {} } = useQuery({
    queryKey: ["avisos-autores", avisos.map((a) => a.created_by).join(",")],
    enabled: avisos.length > 0,
    queryFn: async () => {
      const ids = [...new Set(avisos.map((a) => a.created_by))];
      const { data } = await supabase.from("profiles").select("id, nome, email").in("id", ids);
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.nome || p.email;
      return map;
    },
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("avisos").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["avisos"] });
    },
    onError: (e) => toast.error("Não foi possível atualizar", { description: (e as Error).message }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Comunicação
          </div>
          <h1 className="font-display text-2xl font-bold">Avisos</h1>
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? "Avisos enviados pelos motoristas, fora do fluxo das viagens."
              : "Envie um aviso para a operação, mesmo sem carga atribuída."}
          </p>
        </div>
        <NovoAvisoDialog onDone={() => qc.invalidateQueries({ queryKey: ["avisos"] })} />
      </div>

      {isLoading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <Loader2 className="size-6 animate-spin text-brand" />
        </div>
      ) : avisos.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Nenhum aviso registrado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {avisos.map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {CATEGORIAS.find((c) => c.value === a.categoria)?.label ?? a.categoria}
                  </Badge>
                  <Badge
                    className={
                      a.status === "resolvido"
                        ? "bg-success text-success-foreground"
                        : a.status === "em_andamento"
                          ? "bg-warning text-warning-foreground"
                          : "bg-brand text-brand-foreground"
                    }
                  >
                    {STATUS_LABEL[a.status] ?? a.status}
                  </Badge>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="font-display text-base font-semibold">{a.assunto}</div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{a.mensagem}</p>
                <div className="text-[11px] text-muted-foreground">
                  Enviado por {autores[a.created_by] ?? "—"}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAberto(aberto === a.id ? null : a.id)}
                  >
                    <MessagesSquare className="mr-1 size-4" />
                    {aberto === a.id ? "Fechar conversa" : "Abrir conversa"}
                  </Button>
                  {isStaff && a.status !== "resolvido" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => mudarStatus.mutate({ id: a.id, status: "resolvido" })}
                    >
                      <CheckCircle2 className="mr-1 size-4" /> Marcar como resolvido
                    </Button>
                  )}
                  {isStaff && a.status === "aberto" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => mudarStatus.mutate({ id: a.id, status: "em_andamento" })}
                    >
                      Em tratamento
                    </Button>
                  )}
                </div>

                {aberto === a.id && <Conversa avisoId={a.id} userId={user?.id ?? ""} nomes={autores} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Conversa({
  avisoId,
  userId,
  nomes,
}: {
  avisoId: string;
  userId: string;
  nomes: Record<string, string>;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ["aviso-mensagens", avisoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos_mensagens")
        .select("id, autor_id, mensagem, created_at")
        .eq("aviso_id", avisoId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("avisos_mensagens")
        .insert({ aviso_id: avisoId, autor_id: userId, mensagem: texto.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["aviso-mensagens", avisoId] });
    },
    onError: (e) => toast.error("Não foi possível enviar", { description: (e as Error).message }),
  });

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border/70 p-3">
      {isLoading ? (
        <Loader2 className="size-4 animate-spin text-brand" />
      ) : msgs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma resposta ainda.</p>
      ) : (
        <ul className="space-y-2">
          {msgs.map((m) => (
            <li
              key={m.id}
              className={`rounded-md p-2 text-xs ${
                m.autor_id === userId ? "bg-brand-subtle" : "bg-muted"
              }`}
            >
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>{m.autor_id === userId ? "Você" : (nomes[m.autor_id ?? ""] ?? "Operação")}</span>
                <span>{new Date(m.created_at).toLocaleString("pt-BR")}</span>
              </div>
              <p className="whitespace-pre-wrap">{m.mensagem}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva uma mensagem"
          onKeyDown={(e) => {
            if (e.key === "Enter" && texto.trim()) enviar.mutate();
          }}
        />
        <Button
          size="icon"
          disabled={!texto.trim() || enviar.isPending}
          onClick={() => enviar.mutate()}
          aria-label="Enviar mensagem"
        >
          {enviar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

function NovoAvisoDialog({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [categoria, setCategoria] = useState("geral");
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      const { data: mot } = await supabase
        .from("motoristas")
        .select("id, veiculo_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      const { error } = await supabase.from("avisos").insert({
        created_by: user!.id,
        motorista_id: mot?.id ?? null,
        veiculo_id: mot?.veiculo_id ?? null,
        categoria,
        assunto: assunto.trim(),
        mensagem: mensagem.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso enviado", { description: "A operação foi notificada." });
      setAssunto("");
      setMensagem("");
      setCategoria("geral");
      setOpen(false);
      onDone();
    },
    onError: (e) => toast.error("Não foi possível enviar", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-brand hover:bg-brand/90">
          <MessageSquarePlus className="mr-2 size-4" /> Novo aviso
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar aviso</DialogTitle>
          <DialogDescription>
            Comunique a operação sobre qualquer situação, mesmo sem viagem em andamento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Tipo</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Assunto</Label>
            <Input
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Ex.: Parado para troca de pneu"
              maxLength={120}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Mensagem</Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Descreva a situação"
              rows={4}
            />
          </div>
          <Button
            className="w-full bg-brand hover:bg-brand/90"
            disabled={!assunto.trim() || !mensagem.trim() || criar.isPending}
            onClick={() => criar.mutate()}
          >
            {criar.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Enviar aviso
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
