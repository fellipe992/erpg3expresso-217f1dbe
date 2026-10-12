import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, MessageCircle, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { gerarAbordagem } from "@/lib/treinador.functions";

export const Route = createFileRoute("/_authenticated/app/crm/clientes-hunter")({
  head: () => ({
    meta: [
      { title: "Clientes do Hunter | G3 Expresso" },
      { name: "description", content: "Clientes cadastrados no Hunter com segmento, tipo de frete e contato para reabordar." },
      { property: "og:title", content: "Clientes do Hunter | G3 Expresso" },
      { property: "og:description", content: "Reaborde clientes sem perder o que já foi cadastrado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const FRETES = ["LOTAÇÃO / DEDICADO", "FRACIONADO", "CARGA SECA", "REFRIGERADA", "TRANSFERÊNCIA", "DISTRIBUIÇÃO URBANA"];
type Cli = {
  id: string; empresa: string; segmento: string | null; tipo_frete: string | null; contato: string | null; cargo: string | null;
  telefone: string | null; email: string | null; cidade: string | null; observacao: string | null; ultima_abordagem_em: string | null;
};
const vazio = { empresa: "", segmento: "", tipo_frete: "", contato: "", cargo: "", telefone: "", email: "", cidade: "", observacao: "" };
const UP = (s: string) => s.toUpperCase();
const waLink = (t: string, n?: string | null) => {
  const d = (n ?? "").replace(/\D/g, "");
  return `https://wa.me/${d && d.length <= 11 ? `55${d}` : d}?text=${encodeURIComponent(t)}`;
};

function Page() {
  const qc = useQueryClient();
  const fn = useServerFn(gerarAbordagem);
  const [form, setForm] = useState<typeof vazio & { id?: string }>(vazio);
  const [editando, setEditando] = useState(false);
  const [busca, setBusca] = useState("");
  const [gerando, setGerando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ cli: Cli; id: string | null; r: { email_assunto: string; email_corpo: string; whatsapp: string; whatsapp_followup: string } } | null>(null);

  const q = useQuery({
    queryKey: ["hunter-clientes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hunter_clientes").select("*").order("empresa").limit(1000);
      if (error) throw error;
      return data as Cli[];
    },
  });

  const salvar = async () => {
    if (!form.empresa.trim()) return toast.error("Informe a empresa.");
    const { id, ...p } = form;
    const payload = { ...p, empresa: UP(p.empresa), segmento: UP(p.segmento) || null, contato: UP(p.contato) || null,
      cargo: UP(p.cargo) || null, cidade: UP(p.cidade) || null, observacao: UP(p.observacao) || null,
      tipo_frete: p.tipo_frete || null, telefone: p.telefone || null, email: p.email || null };
    const { error } = id ? await supabase.from("hunter_clientes").update(payload).eq("id", id) : await supabase.from("hunter_clientes").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Cliente salvo.");
    setEditando(false); setForm(vazio);
    qc.invalidateQueries({ queryKey: ["hunter-clientes"] });
  };
  const excluir = async (id: string) => {
    const { error } = await supabase.from("hunter_clientes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["hunter-clientes"] });
  };
  const reabordar = async (c: Cli) => {
    setGerando(c.id);
    try {
      const r = await fn({ data: {
        empresa: c.empresa, contato: c.contato ?? "", cargo: c.cargo ?? "", segmento: c.segmento ?? "",
        contexto: [c.tipo_frete && `Tipo de frete: ${c.tipo_frete}`, c.cidade && `Cidade: ${c.cidade}`, c.observacao && `Histórico: ${c.observacao}`,
          c.ultima_abordagem_em && "Já foi abordado antes: faça uma reabordagem, sem repetir a primeira mensagem."].filter(Boolean).join(". "),
        whatsapp: c.telefone ?? "", email: c.email ?? "", companyId: c.id,
      } });
      if (r.id) await supabase.from("hunter_abordagens").update({ cliente_id: c.id }).eq("id", r.id);
      await supabase.from("hunter_clientes").update({ ultima_abordagem_em: new Date().toISOString() }).eq("id", c.id);
      setMsg({ cli: c, id: r.id, r });
      qc.invalidateQueries({ queryKey: ["hunter-clientes"] });
      qc.invalidateQueries({ queryKey: ["hunter-abordagens"] });
    } catch (e) { toast.error((e as Error).message); } finally { setGerando(null); }
  };
  const marcar = async (canal: string) => {
    if (!msg?.id) return;
    await supabase.from("hunter_abordagens").update({ enviado_em: new Date().toISOString(), status: "em_abordagem", canal_envio: canal }).eq("id", msg.id);
    qc.invalidateQueries({ queryKey: ["hunter-abordagens"] });
  };

  const lista = (q.data ?? []).filter((c) => !busca || `${c.empresa} ${c.segmento ?? ""} ${c.contato ?? ""}`.toLowerCase().includes(busca.toLowerCase()));
  const campo = (k: keyof typeof vazio, label: string, type = "text") => (
    <div className="space-y-1"><Label>{label}</Label><Input type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></div>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">Clientes do Hunter</h1>
          <p className="text-sm text-muted-foreground">Cadastre e reaborde clientes sem perder o histórico.</p></div>
        <Button onClick={() => { setForm(vazio); setEditando(true); }}><Plus className="mr-1.5 size-4" /> Novo cliente</Button>
      </div>
      <Input className="max-w-sm" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {q.isLoading && <Loader2 className="size-5 animate-spin" />}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr><th className="p-2">Empresa</th><th className="p-2">Segmento</th><th className="p-2">Tipo de frete</th><th className="p-2">Contato</th><th className="p-2">Última abordagem</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2 font-medium">{c.empresa}<div className="text-xs text-muted-foreground">{c.cidade}</div></td>
                <td className="p-2">{c.segmento ?? "—"}</td>
                <td className="p-2">{c.tipo_frete ?? "—"}</td>
                <td className="p-2">{c.contato ?? "—"}{c.cargo && <span className="text-xs text-muted-foreground"> · {c.cargo}</span>}
                  <div className="text-xs text-muted-foreground">{[c.telefone, c.email].filter(Boolean).join(" · ")}</div></td>
                <td className="whitespace-nowrap p-2 text-xs">{c.ultima_abordagem_em ? new Date(c.ultima_abordagem_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nunca"}</td>
                <td className="whitespace-nowrap p-2 text-right">
                  <Button size="sm" onClick={() => reabordar(c)} disabled={gerando === c.id}>
                    {gerando === c.id ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Send className="mr-1 size-3.5" />} Reabordar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setForm({ ...vazio, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ""])) } as any); setEditando(true); }}><Pencil className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => excluir(c.id)}><Trash2 className="size-3.5" /></Button>
                </td>
              </tr>
            ))}
            {!q.isLoading && lista.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Nenhum cliente cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("empresa", "Empresa")}{campo("segmento", "Segmento")}
            <div className="space-y-1"><Label>Tipo de frete</Label>
              <Select value={form.tipo_frete} onValueChange={(v) => setForm({ ...form, tipo_frete: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{FRETES.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select></div>
            {campo("cidade", "Cidade")}{campo("contato", "Contato")}{campo("cargo", "Cargo")}
            {campo("telefone", "Telefone / WhatsApp", "tel")}{campo("email", "E-mail", "email")}
          </div>
          <div className="space-y-1"><Label>Observações</Label><Textarea rows={3} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></div>
          <Button onClick={salvar}>Salvar</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!msg} onOpenChange={(o) => !o && setMsg(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {msg && (<>
            <DialogHeader><DialogTitle>Reabordagem · {msg.cli.empresa}</DialogTitle></DialogHeader>
            {[{ t: "E-mail", v: `${msg.r.email_assunto}\n\n${msg.r.email_corpo}`, wa: false },
              { t: "WhatsApp", v: msg.r.whatsapp, wa: true }, { t: "Follow-up (3 dias)", v: msg.r.whatsapp_followup, wa: true }].map((b) => (
              <div key={b.t} className="rounded-md border bg-muted/40 p-3">
                <div className="mb-1 flex items-center gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{b.t}</span>
                  <Button size="sm" variant="ghost" className="ml-auto h-6 px-2" onClick={() => navigator.clipboard.writeText(b.v).then(() => toast.success("Copiado!"))}><Copy className="size-3" /></Button>
                  {b.wa && <Button size="sm" variant="ghost" className="h-6 px-2" asChild>
                    <a href={waLink(b.v, msg.cli.telefone)} target="_blank" rel="noreferrer" onClick={() => marcar("whatsapp")}><MessageCircle className="size-3" /></a></Button>}
                </div>
                <p className="whitespace-pre-wrap text-sm">{b.v}</p>
              </div>
            ))}
            <Button variant="secondary" onClick={() => { marcar("manual"); toast.success("Envio registrado."); }}>Marcar como enviada</Button>
          </>)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
