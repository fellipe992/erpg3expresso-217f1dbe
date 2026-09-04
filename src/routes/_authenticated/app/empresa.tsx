import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Save, Loader2, Building2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCompany, getSignedLogoUrl } from "@/hooks/use-company";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/empresa")({
  head: () => ({ meta: [{ title: "Configurações da empresa — G3 Expresso" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: EmpresaPage,
});

function EmpresaPage() {
  const { data: company, isLoading } = useCompany();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome_fantasia: "",
    razao_social: "",
    cnpj: "",
    inscricao_estadual: "",
    rntrc: "",
    endereco: "",
    endereco_numero: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
    telefone: "",
    email: "",
  });

  const isAdmin = role === "administrador";

  useEffect(() => {
    if (company) {
      setForm({
        nome_fantasia: company.nome_fantasia ?? "",
        razao_social: company.razao_social ?? "",
        cnpj: company.cnpj ?? "",
        inscricao_estadual: company.inscricao_estadual ?? "",
        rntrc: company.rntrc ?? "",
        endereco: company.endereco ?? "",
        endereco_numero: company.endereco_numero ?? "",
        bairro: company.bairro ?? "",
        cidade: company.cidade ?? "",
        uf: company.uf ?? "",
        cep: company.cep ?? "",
        telefone: company.telefone ?? "",
        email: company.email ?? "",
      });
      getSignedLogoUrl(company.logo_url).then(setLogoPreview);
    }
  }, [company]);


  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Configuração não carregada");
      const { error } = await supabase
        .from("company_settings")
        .update(form)
        .eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados atualizados");
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !company) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 2MB)");
      return;
    }
    const ext = file.name.split(".").pop() ?? "png";
    const path = `logos/logo-${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("company-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadErr) return toast.error("Erro no upload", { description: uploadErr.message });
    const { error: updateErr } = await supabase
      .from("company_settings")
      .update({ logo_url: path })
      .eq("id", company.id);
    if (updateErr) return toast.error("Erro ao salvar logo", { description: updateErr.message });
    toast.success("Logo atualizado");
    queryClient.invalidateQueries({ queryKey: ["company-settings"] });
    getSignedLogoUrl(path).then(setLogoPreview);
  }

  if (isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
          <Building2 className="size-5 text-brand" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Configurações da empresa</h1>
          <p className="text-sm text-muted-foreground">
            Estes dados aparecem no login, sidebar e relatórios.
          </p>
        </div>
      </div>

      {!isAdmin && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Somente administradores podem editar estes dados.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>PNG, JPG ou SVG · máx 2MB</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid aspect-square place-items-center rounded-lg border border-dashed bg-muted/40 p-6">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <div className="text-center">
                  <Building2 className="mx-auto size-8 text-muted-foreground" />
                  <div className="mt-2 text-xs text-muted-foreground">Nenhum logo enviado</div>
                </div>
              )}
            </div>
            <label className={`block ${!isAdmin && "pointer-events-none opacity-60"}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="sr-only"
                onChange={handleLogoUpload}
                disabled={!isAdmin}
              />
              <div className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Upload className="size-4" />
                Enviar logo
              </div>
            </label>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Dados cadastrais</CardTitle>
            <CardDescription>Nome fantasia, CNPJ e contato</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome fantasia" id="nome_fantasia">
                <Input
                  id="nome_fantasia"
                  value={form.nome_fantasia}
                  onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="Razão social" id="razao_social">
                <Input
                  id="razao_social"
                  value={form.razao_social}
                  onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="CNPJ" id="cnpj">
                <Input
                  id="cnpj"
                  value={form.cnpj}
                  onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                  disabled={!isAdmin}
                  placeholder="00.000.000/0000-00"
                />
              </Field>
              <Field label="Telefone" id="telefone">
                <Input
                  id="telefone"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="E-mail" id="email">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
            </div>
            <Field label="Endereço" id="endereco">
              <Textarea
                id="endereco"
                value={form.endereco}
                onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                disabled={!isAdmin}
                rows={2}
              />
            </Field>
            {isAdmin && (
              <div className="flex justify-end">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-4" />
                  )}
                  Salvar alterações
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}
