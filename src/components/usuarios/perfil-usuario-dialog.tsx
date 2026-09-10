import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, IdCard, Loader2, Mail, Phone, Truck, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { DocsOneDrive } from "@/components/perfil/docs-onedrive";

export type PerfilUsuarioAlvo = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  ativo: boolean;
  role: string | null;
  avatar_url: string | null;
  motorista_id: string | null;
};

/** Visualização rápida (somente leitura) do perfil de um usuário. */
export function PerfilUsuarioDialog({
  alvo,
  onClose,
}: {
  alvo: PerfilUsuarioAlvo | null;
  onClose: () => void;
}) {
  const [foto, setFoto] = useState<string | null>(null);

  useEffect(() => {
    const p = alvo?.avatar_url;
    if (!p) return setFoto(null);
    if (p.startsWith("http")) return setFoto(p);
    let cancel = false;
    void supabase.storage
      .from("avatars")
      .createSignedUrl(p, 60 * 60)
      .then(({ data }) => {
        if (!cancel) setFoto(data?.signedUrl ?? null);
      });
    return () => {
      cancel = true;
    };
  }, [alvo?.avatar_url]);

  const { data: motorista, isLoading } = useQuery({
    queryKey: ["perfil-usuario-motorista", alvo?.motorista_id],
    enabled: !!alvo?.motorista_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("motoristas")
        .select(
          "id, nome, cpf, cnh, cnh_categoria, cnh_validade, telefone, email, cidade, uf, ativo, veiculo:veiculos(placa, modelo, marca)",
        )
        .eq("id", alvo!.motorista_id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const veic = motorista?.veiculo as { placa: string; modelo: string; marca: string | null } | null;

  return (
    <Dialog open={!!alvo} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Perfil do usuário</DialogTitle>
          <DialogDescription>Visualização rápida dos dados e documentos.</DialogDescription>
        </DialogHeader>

        {alvo && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {foto ? (
                <img
                  src={foto}
                  alt={`Foto de ${alvo.nome}`}
                  className="size-16 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="grid size-16 shrink-0 place-items-center rounded-full bg-brand font-display text-xl font-bold text-brand-foreground">
                  {(alvo.nome || "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-bold capitalize">{alvo.nome}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {alvo.role && (
                    <Badge variant="outline" className="border-brand/30 capitalize text-brand">{alvo.role}</Badge>
                  )}
                  <Badge variant={alvo.ativo ? "default" : "outline"}>{alvo.ativo ? "Ativo" : "Inativo"}</Badge>
                </div>
              </div>
            </div>

            <Card>
              <CardContent className="space-y-1 p-4">
                <Info icon={Mail} label="E-mail" value={alvo.email || motorista?.email || "—"} />
                {(alvo.telefone || motorista?.telefone) && (
                  <Info icon={Phone} label="Telefone" value={alvo.telefone ?? motorista!.telefone!} />
                )}
                {motorista?.cpf && <Info icon={IdCard} label="CPF" value={motorista.cpf} />}
                {motorista?.cnh && (
                  <Info
                    icon={IdCard}
                    label="CNH"
                    value={`${motorista.cnh}${motorista.cnh_categoria ? ` (${motorista.cnh_categoria})` : ""}`}
                  />
                )}
                {motorista?.cnh_validade && (
                  <Info
                    icon={Calendar}
                    label="Validade CNH"
                    value={new Date(motorista.cnh_validade).toLocaleDateString("pt-BR")}
                  />
                )}
                {(motorista?.cidade || motorista?.uf) && (
                  <Info
                    icon={MapPin}
                    label="Cidade"
                    value={[motorista?.cidade, motorista?.uf].filter(Boolean).join(" / ")}
                  />
                )}
                {veic && (
                  <Info
                    icon={Truck}
                    label="Veículo vinculado"
                    value={`${veic.placa} · ${veic.marca ?? ""} ${veic.modelo}`.trim()}
                  />
                )}
                {isLoading && (
                  <div className="grid place-items-center py-2">
                    <Loader2 className="size-4 animate-spin text-brand" />
                  </div>
                )}
              </CardContent>
            </Card>

            {alvo.motorista_id ? (
              <DocsOneDrive motoristaId={alvo.motorista_id} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Usuário sem motorista vinculado — sem pasta de documentos.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-2 last:border-0">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
