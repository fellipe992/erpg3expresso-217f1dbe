import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Smartphone, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CATEGORIAS, registerPushToken } from "@/lib/notifications";
import { testarPush, testarTelegram } from "@/lib/alertas-externos.functions";

export const Route = createFileRoute("/_authenticated/app/alertas-externos")({
  head: () => ({
    meta: [
      { title: "Alertas externos (Telegram e push) — G3 Expresso" },
      { name: "description", content: "Envie os alertas da G3 para grupos do Telegram e para o celular via push." },
      { property: "og:title", content: "Alertas externos — G3 Expresso" },
      { property: "og:description", content: "Torre de controle no Telegram e notificações push no celular." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

const MSG_PUSH: Record<string, string> = {
  "not-configured": "O Firebase ainda não tem o envio para navegador habilitado.",
  unsupported: "Este navegador não suporta notificações push.",
  "open-in-new-tab": "Abra o sistema em uma aba própria (ou no app publicado) para ativar.",
  denied: "Notificações bloqueadas. Libere nas configurações do site/celular.",
};

function Pagina() {
  const { role } = useAuth();
  const gestor = role === "administrador" || role === "gestor";
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Alertas externos</h1>
        <p className="text-sm text-muted-foreground">
          Os avisos da central (SOS, zonas de risco, viagens, entregas) também chegam no Telegram e na barra do celular.
        </p>
      </div>
      <PushCard />
      {gestor && <TelegramCard />}
    </div>
  );
}

function PushCard() {
  const testar = useServerFn(testarPush);
  const ativar = useMutation({
    mutationFn: registerPushToken,
    onSuccess: (r) => {
      if (r.status === "registered") toast.success("Notificações push ativadas neste aparelho.");
      else toast.error(r.status === "error" ? `Falha: ${r.detalhe}` : MSG_PUSH[r.status]);
    },
  });
  const teste = useMutation({
    mutationFn: () => testar(),
    onSuccess: () => toast.success("Teste enviado. Deve aparecer em instantes."),
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Push neste aparelho</CardTitle>
        <CardDescription>Recebe seus avisos mesmo com o app fechado ou a tela bloqueada.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={() => ativar.mutate()} disabled={ativar.isPending}>Ativar notificações push</Button>
        <Button variant="outline" onClick={() => teste.mutate()} disabled={teste.isPending}>Enviar teste</Button>
      </CardContent>
    </Card>
  );
}

function TelegramCard() {
  const qc = useQueryClient();
  const testar = useServerFn(testarTelegram);
  const destinos = useQuery({
    queryKey: ["telegram_destinos"],
    queryFn: async () => (await supabase.from("telegram_destinos").select("*").order("criado_em")).data ?? [],
  });
  const detectados = useQuery({
    queryKey: ["telegram_chats_detectados"],
    queryFn: async () =>
      (await supabase.from("telegram_chats_detectados").select("*").order("visto_em", { ascending: false })).data ?? [],
    refetchInterval: 10000,
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["telegram_destinos"] });
    void qc.invalidateQueries({ queryKey: ["telegram_chats_detectados"] });
  };
  const salvar = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("telegram_destinos").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    recarregar();
  };
  const adicionar = async (chatId: number, nome: string) => {
    const { error } = await supabase.from("telegram_destinos").insert({ chat_id: chatId, nome: (nome || String(chatId)).toUpperCase() });
    if (error) toast.error(error.message);
    else toast.success("Chat liberado para receber alertas.");
    recarregar();
  };
  const jaCadastrados = new Set((destinos.data ?? []).map((d) => d.chat_id));
  const novos = (detectados.data ?? []).filter((c) => !jaCadastrados.has(c.chat_id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Torre de controle no Telegram</CardTitle>
        <CardDescription>
          Adicione o bot da G3 ao grupo da equipe (ou envie /start no privado). O chat aparece abaixo para liberar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {novos.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Chats detectados aguardando liberação</p>
            {novos.map((c) => (
              <div key={c.chat_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div>
                  <p className="font-medium">{c.titulo || c.chat_id}</p>
                  <p className="text-xs text-muted-foreground">{c.tipo}</p>
                </div>
                <Button size="sm" onClick={() => adicionar(c.chat_id, c.titulo ?? "")}><Plus className="mr-1 h-4 w-4" /> Liberar</Button>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-3">
          <p className="text-sm font-medium">Chats que recebem alertas</p>
          {(destinos.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum chat liberado ainda.</p>
          )}
          {(destinos.data ?? []).map((d) => (
            <div key={d.id} className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{d.nome}</p>
                <div className="flex items-center gap-2">
                  <Switch checked={d.ativo} onCheckedChange={(v) => salvar(d.id, { ativo: v })} />
                  <Button size="sm" variant="outline" onClick={() =>
                    testar({ data: { chatId: d.chat_id } }).then(() => toast.success("Mensagem de teste enviada."), (e) => toast.error((e as Error).message))
                  }>Testar</Button>
                  <Button size="icon" variant="ghost" aria-label="Remover" onClick={async () => {
                    await supabase.from("telegram_destinos").delete().eq("id", d.id);
                    recarregar();
                  }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map((c) => {
                  const on = d.categorias.includes(c.value);
                  return (
                    <Badge key={c.value} variant={on ? "default" : "outline"} className="cursor-pointer"
                      onClick={() => salvar(d.id, { categorias: on ? d.categorias.filter((x) => x !== c.value) : [...d.categorias, c.value] })}>
                      {c.label}
                    </Badge>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={d.somente_alta} onCheckedChange={(v) => salvar(d.id, { somente_alta: v })} />
                Somente alertas urgentes (SOS, zona de risco, prioridade alta)
              </label>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
