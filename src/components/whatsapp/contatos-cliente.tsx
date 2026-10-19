import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export const EVENTOS_WA = [
  { id: "inicio_viagem", label: "Início de viagem" },
  { id: "a_caminho", label: "Saída p/ próxima entrega" },
  { id: "entrega_concluida", label: "Entrega concluída" },
  { id: "fim_viagem", label: "Fim de viagem" },
  { id: "zona_risco", label: "Zona de risco" },
  { id: "alerta_motorista", label: "Alertas do motorista" },
  { id: "posicao", label: "Responder posição" },
];

const soDigitos = (t: string) => t.replace(/\D/g, "");

/** Monitores do cliente que recebem os avisos no WhatsApp. */
export function ContatosWhatsAppCliente({ clienteId }: { clienteId: string }) {
  const qc = useQueryClient();
  const key = ["cliente-contatos-wa", clienteId];
  const { data: contatos = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cliente_contatos_whatsapp")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [tel, setTel] = useState("");
  const [salvando, setSalvando] = useState(false);

  const adicionar = async () => {
    const d = soDigitos(tel);
    if (!nome.trim() || d.length < 10) return toast.error("Informe nome e WhatsApp com DDD");
    setSalvando(true);
    const { error } = await supabase.from("cliente_contatos_whatsapp").insert({
      cliente_id: clienteId,
      nome: nome.trim().toUpperCase(),
      cargo: cargo.trim().toUpperCase() || null,
      telefone: d.length <= 11 ? `55${d}` : d,
    });
    setSalvando(false);
    if (error) return toast.error("Não foi possível salvar", { description: error.message });
    setNome("");
    setCargo("");
    setTel("");
    qc.invalidateQueries({ queryKey: key });
  };

  const alternar = async (id: string, eventos: string[], ev: string) => {
    const novos = eventos.includes(ev) ? eventos.filter((e) => e !== ev) : [...eventos, ev];
    const { error } = await supabase.from("cliente_contatos_whatsapp").update({ eventos: novos }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  };

  const remover = async (id: string) => {
    const { error } = await supabase.from("cliente_contatos_whatsapp").delete().eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2 font-medium">
        <MessageCircle className="size-4 text-brand" /> Monitores / WhatsApp
      </div>
      <p className="text-xs text-muted-foreground">
        Cada número recebe no WhatsApp os avisos marcados e pode conversar com o motorista.
      </p>
      {isLoading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        contatos.map((c) => (
          <div key={c.id} className="space-y-2 rounded border p-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{c.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {c.cargo ? `${c.cargo} · ` : ""}+{c.telefone}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remover(c.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {EVENTOS_WA.map((e) => (
                <label key={e.id} className="flex items-center gap-1 text-xs">
                  <Checkbox checked={c.eventos.includes(e.id)} onCheckedChange={() => alternar(c.id, c.eventos, e.id)} />
                  {e.label}
                </label>
              ))}
            </div>
          </div>
        ))
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input placeholder="NOME" value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} />
        <Input placeholder="CARGO" value={cargo} onChange={(e) => setCargo(e.target.value.toUpperCase())} />
        <Input placeholder="WhatsApp com DDD" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} />
        <Button type="button" onClick={adicionar} disabled={salvando}>
          {salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Adicionar
        </Button>
      </div>
      {contatos.length === 0 && <Badge variant="outline">Nenhum monitor cadastrado</Badge>}
    </div>
  );
}
