import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Loader2, Mail, Lock } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Controle Financeiro G3 Expresso" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AuthPage,
});

const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});




function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"login" | "signup" | "forgot">("login");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { data: signIn, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      setLoading(false);
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    // Bloqueia usuários inativos
    const uid = signIn.user?.id;
    if (uid) {
      const { data: profile } = await supabase
        .from("profiles").select("ativo").eq("id", uid).maybeSingle();
      if (profile && profile.ativo === false) {
        await supabase.auth.signOut({ scope: "local" });
        setLoading(false);
        toast.error("Acesso bloqueado", {
          description: "Seu acesso está desativado. Entre em contato com o administrador.",
        });
        return;
      }
    }
    setLoading(false);
    toast.success("Bem-vindo(a) de volta");
    navigate({ to: "/app", replace: true });
  }




  async function handleForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email) return toast.error("Informe seu e-mail");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao enviar", { description: error.message });
      return;
    }
    toast.success("E-mail de recuperação enviado");
    setTab("login");
  }

  return (
    <div className="relative min-h-screen bg-background">
      {/* Grid de fundo sutil */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(to right, oklch(0 0 0 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, oklch(0 0 0 / 0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size="lg" />
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Portal interno
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold">Controle Financeiro</h1>
          </div>
        </div>

        <Card className="border-border/60 shadow-elegant">
          <CardContent className="p-6">
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList className="grid w-full grid-cols-1">
                <TabsTrigger value="login">Entrar</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form className="space-y-4" onSubmit={handleLogin}>
                  <Field id="email" label="E-mail" icon={<Mail className="size-4" />}>
                    <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@g3expresso.com" required />
                  </Field>
                  <Field id="password" label="Senha" icon={<Lock className="size-4" />}>
                    <PasswordInput id="password" name="password" autoComplete="current-password" required />
                  </Field>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setTab("forgot")}
                      className="text-xs text-muted-foreground underline-offset-4 hover:text-brand hover:underline"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    Entrar
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Novas contas são criadas apenas por administradores.
                  </p>
                </form>
              </TabsContent>


              <TabsContent value="forgot" className="mt-6">
                <form className="space-y-4" onSubmit={handleForgot}>
                  <div>
                    <h2 className="font-display text-lg font-semibold">Recuperar senha</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Enviaremos um link de redefinição para o seu e-mail.
                    </p>
                  </div>
                  <Field id="email-f" label="E-mail" icon={<Mail className="size-4" />}>
                    <Input id="email-f" name="email" type="email" required />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1" onClick={() => setTab("login")}>
                      Voltar
                    </Button>
                    <Button type="submit" className="flex-1" disabled={loading}>
                      {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Enviar link
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acesso restrito a usuários autorizados da G3 Expresso.
        </p>
        <div className="mt-2 text-center">
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
            ← Início
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  icon,
  children,
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium">
        {label}
      </Label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        ) : null}
        <div className={icon ? "[&_input]:pl-9" : ""}>{children}</div>
      </div>
    </div>
  );
}
