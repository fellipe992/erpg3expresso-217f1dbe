import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  Check,
  CheckCheck,
  FileText,
  Loader2,
  MapPin,
  Radar,
  Trash2,
  Wallet,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CATEGORIAS, type NotifCategoria } from "@/lib/notifications";

export type NotificacaoRow = {
  id: string;
  categoria: string;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  prioridade: string;
  lida_em: string | null;
  created_at: string;
};

export const CATEGORIA_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  viagem: MapPin,
  monitoramento: Radar,
  documento: FileText,
  manutencao: Wrench,
  financeiro: Wallet,
  sistema: Bell,
};

export const NOTIF_SELECT =
  "id, categoria, tipo, titulo, mensagem, link, prioridade, lida_em, created_at";

export function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotificacoesCentral() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<NotifCategoria | "todas">("todas");

  const queryKey = ["notificacoes-central", user?.id];

  const { data: itens = [], isLoading } = useQuery<NotificacaoRow[]>({
    queryKey,
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select(NOTIF_SELECT)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as NotificacaoRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["notificacoes", user?.id] });
  };

  const marcarLida = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const marcarTodas = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notificacoes")
        .update({ lida_em: new Date().toISOString() })
        .is("lida_em", null);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notificacoes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const filtradas = useMemo(
    () => (filtro === "todas" ? itens : itens.filter((n) => n.categoria === filtro)),
    [itens, filtro],
  );
  const naoLidas = itens.filter((n) => !n.lida_em).length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Central de notificações</h1>
          <p className="text-xs text-muted-foreground">
            {naoLidas > 0 ? `${naoLidas} não lida(s)` : "Tudo em dia"}
          </p>
        </div>
        {naoLidas > 0 && (
          <Button variant="outline" size="sm" onClick={() => marcarTodas.mutate()}>
            <CheckCheck className="mr-1.5 size-4" /> Marcar todas como lidas
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <FiltroChip label="Todas" active={filtro === "todas"} onClick={() => setFiltro("todas")} />
        {CATEGORIAS.map((c) => (
          <FiltroChip
            key={c.value}
            label={c.label}
            active={filtro === c.value}
            onClick={() => setFiltro(c.value)}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-5 animate-spin text-brand" />
        </div>
      ) : filtradas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma notificação nesta categoria.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {filtradas.map((n) => {
            const Icon = CATEGORIA_ICON[n.categoria] ?? Bell;
            return (
              <li key={n.id}>
                <Card className={cn(!n.lida_em && "border-brand/40 bg-brand/5")}>
                  <CardContent className="flex items-start gap-3 p-3">
                    <div className="mt-0.5 rounded-md bg-muted p-2">
                      <Icon className="size-4 text-brand" />
                    </div>
                    <button
                      className="flex-1 text-left"
                      onClick={() => {
                        if (!n.lida_em) marcarLida.mutate(n.id);
                        if (n.link) navigate({ to: n.link as never });
                      }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{n.titulo}</span>
                        {n.prioridade === "alta" && (
                          <Badge variant="destructive" className="h-4 px-1 text-[9px]">
                            urgente
                          </Badge>
                        )}
                        <Badge variant="outline" className="h-4 px-1 text-[9px] font-normal">
                          {n.lida_em ? "Lida" : "Não lida"}
                        </Badge>
                      </div>
                      {n.mensagem && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.mensagem}</p>
                      )}
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {dataHora(n.created_at)}
                      </p>
                    </button>
                    <div className="flex shrink-0 flex-col gap-1">
                      {!n.lida_em && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Marcar como lida"
                          onClick={() => marcarLida.mutate(n.id)}
                        >
                          <Check className="size-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Excluir"
                        onClick={() => remover.mutate(n.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function FiltroChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={onClick}>
      {label}
    </Button>
  );
}
