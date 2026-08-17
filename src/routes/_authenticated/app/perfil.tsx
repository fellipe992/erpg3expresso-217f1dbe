import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { User, Loader2, LogOut, Truck, Phone, Mail, IdCard, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/perfil")({
  head: () => ({ meta: [{ title: "Perfil — G3 Expresso" }] }),
  component: PerfilPage,
});

function PerfilPage() {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["perfil", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const [{ data: profile }, { data: mot }] = await Promise.all([
        supabase.from("profiles").select("nome, email, ativo").eq("id", user!.id).maybeSingle(),
        supabase
          .from("motoristas")
          .select("nome, cpf, cnh, cnh_categoria, cnh_validade, telefone, email, cidade, uf, veiculo:veiculos(placa, modelo, marca)")
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
      return { profile, motorista: mot };
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    toast.success("Você saiu do sistema");
    navigate({ to: "/auth" });
  };

  if (isLoading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="size-6 animate-spin text-brand" /></div>;

  const nome = data?.motorista?.nome ?? data?.profile?.nome ?? user?.email?.split("@")[0];
  const veic = data?.motorista?.veiculo as { placa: string; modelo: string; marca: string | null } | null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <div className="grid size-14 place-items-center rounded-full bg-brand text-brand-foreground font-display text-xl font-bold">
          {(nome ?? "?").slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Perfil</div>
          <h1 className="font-display text-2xl font-bold capitalize">{nome}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="outline" className="border-brand/30 text-brand capitalize">{role}</Badge>
            {data?.profile?.ativo && <Badge variant="outline">Ativo</Badge>}
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <Info icon={Mail} label="E-mail" value={data?.profile?.email ?? user?.email ?? "—"} />
          {data?.motorista?.telefone && <Info icon={Phone} label="Telefone" value={data.motorista.telefone} />}
          {data?.motorista?.cpf && <Info icon={IdCard} label="CPF" value={data.motorista.cpf} />}
          {data?.motorista?.cnh && (
            <Info
              icon={IdCard}
              label="CNH"
              value={`${data.motorista.cnh}${data.motorista.cnh_categoria ? ` (${data.motorista.cnh_categoria})` : ""}`}
            />
          )}
          {data?.motorista?.cnh_validade && (
            <Info icon={Calendar} label="Validade CNH" value={new Date(data.motorista.cnh_validade).toLocaleDateString("pt-BR")} />
          )}
          {veic && (
            <Info icon={Truck} label="Veículo vinculado" value={`${veic.placa} · ${veic.marca ?? ""} ${veic.modelo}`.trim()} />
          )}
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={signOut}>
        <LogOut className="mr-2 size-4" /> Sair
      </Button>
    </div>
  );
}

function Info({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-2 last:border-0">
      <Icon className="size-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
