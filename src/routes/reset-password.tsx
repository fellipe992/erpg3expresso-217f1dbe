import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — G3 Expresso" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres");
    if (password !== confirm) return toast.error("As senhas não conferem");

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error("Erro ao atualizar senha", { description: error.message });
      return;
    }
    toast.success("Senha atualizada com sucesso");
    navigate({ to: "/app", replace: true });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo size="lg" />
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h1 className="font-display text-xl font-semibold">Redefinir senha</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha uma nova senha para acessar o sistema.
            </p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">
                Nova senha
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" name="password" type="password" required minLength={6} className="pl-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-xs">
                Confirmar senha
              </Label>
              <Input id="confirm" name="confirm" type="password" required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Atualizar senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
