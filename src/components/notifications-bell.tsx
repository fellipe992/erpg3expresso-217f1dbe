import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ensureNotificationsReady, notifyLocal, type NotifCategoria } from "@/lib/notifications";
import {
  CATEGORIA_ICON,
  NOTIF_SELECT,
  type NotificacaoRow,
} from "@/components/notificacoes/notificacoes-central";

function tempo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const bootstrapped = useRef(false);

  const { data: itens = [] } = useQuery<NotificacaoRow[]>({
    queryKey: ["notificacoes", user?.id],
    enabled: !!user?.id,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notificacoes")
        .select(NOTIF_SELECT)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as NotificacaoRow[];
    },
  });

  // Permissão de notificações. Os alertas recorrentes (documentos, manutenções,
  // financeiro) são gerados no servidor por rotina agendada.
  useEffect(() => {
    if (!user?.id || bootstrapped.current) return;
    bootstrapped.current = true;
    void ensureNotificationsReady();
  }, [user?.id]);


  // Realtime: novas notificações -> toast + notificação do dispositivo
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as NotificacaoRow;
          qc.invalidateQueries({ queryKey: ["notificacoes", user.id] });
          qc.invalidateQueries({ queryKey: ["notificacoes-central", user.id] });
          toast(n.titulo, {
            description: n.mensagem ?? undefined,
            action: n.link
              ? { label: "Abrir", onClick: () => navigate({ to: n.link as never }) }
              : undefined,
          });
          void notifyLocal({
            titulo: n.titulo,
            mensagem: n.mensagem,
            categoria: (n.categoria as NotifCategoria) ?? "sistema",
            prioridade: n.prioridade === "alta" ? "alta" : "normal",
            tag: n.id,
            link: n.link,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc, navigate]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notificacoes", user?.id] });
    qc.invalidateQueries({ queryKey: ["notificacoes-central", user?.id] });
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

  const naoLidas = itens.filter((n) => !n.lida_em).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {naoLidas > 0 && (
            <Badge
              variant="default"
              className="absolute -right-1 -top-1 flex size-4 min-w-4 items-center justify-center rounded-full p-0 text-[9px]"
            >
              {naoLidas > 9 ? "9+" : naoLidas}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-sm font-semibold">Notificações</div>
          {naoLidas > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => marcarTodas.mutate()}>
              <Check className="mr-1 size-3" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[70vh]">
          {itens.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhuma notificação por aqui.
            </div>
          ) : (
            <ul className="divide-y">
              {itens.map((n) => {
                const Icon = CATEGORIA_ICON[n.categoria] ?? Bell;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "group flex gap-2 px-3 py-2.5 text-sm",
                      !n.lida_em && "bg-brand/5",
                    )}
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-brand" />
                    <button
                      className="flex-1 text-left"
                      onClick={() => {
                        if (!n.lida_em) marcarLida.mutate(n.id);
                        if (n.link) navigate({ to: n.link as never });
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={cn("font-medium", !n.lida_em && "text-brand")}>
                          {n.titulo}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {tempo(n.created_at)}
                        </span>
                      </div>
                      {n.mensagem && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {n.mensagem}
                        </p>
                      )}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        remover.mutate(n.id);
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full text-xs">
            <Link to="/app/notificacoes">Ver central de notificações</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
