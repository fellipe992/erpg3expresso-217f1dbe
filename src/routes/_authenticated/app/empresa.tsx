import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Save, Loader2, Building2, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCompanies, getSignedLogoUrl, type CompanySettings } from "@/hooks/use-company";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/empresa")({
  head: () => ({ meta: [{ title: "Configurações da empresa — G3 Expresso" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: EmpresaPage,
});

const NOVA = "__nova__";

const vazio = {
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
  emitente_fiscal: false,
  emitente_padrao: false,
};

function EmpresaPage() {
  const { data: companies = [], isLoading } = useCompanies();
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [form, setForm] = useState(vazio);

  const isAdmin = role === "administrador";
  const novaEmpresa = selectedId === NOVA;
  const company: CompanySettings | undefined = companies.find((c) => c.id === selectedId);

  useEffect(() => {
    if (!selectedId && companies.length) setSelectedId(companies[0]!.id);
  }, [companies, selectedId]);

  useEffect(() => {
    if (novaEmpresa) {
      setForm({ ...vazio, emitente_fiscal: true });
      setLogoPreview(null);
      return;
    }
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
        emitente_fiscal: company.emitente_fiscal ?? false,
        emitente_padrao: company.emitente_padrao ?? false,
      });
      getSignedLogoUrl(company.logo_url).then(setLogoPreview);
    }
  }, [company, novaEmpresa]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nome_fantasia.trim()) throw new Error("Informe o nome fantasia da empresa.");
      // Só uma empresa pode ser a padrão de emissão.
      if (form.emitente_padrao) {
        await supabase
          .from("company_settings")
          .update({ emitente_padrao: false })
          .eq("emitente_padrao", true);
      }
      if (novaEmpresa) {
        const { data, error } = await supabase
          .from("company_settings")
          .insert(form)
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }
      if (!company) throw new Error("Empresa não carregada");
      const { error } = await supabase.from("company_settings").update(form).eq("id", company.id);
      if (error) throw error;
      return company.id;
    },
    onSuccess: async (id) => {
      toast.success("Dados salvos");
      await queryClient.invalidateQueries({ queryKey: ["company-settings-list"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["status-integracao-fiscal"] });
      setSelectedId(id);
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
    queryClient.invalidateQueries({ queryKey: ["company-settings-list"] });
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
          <h1 className="font-display text-2xl font-bold">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre suas empresas e escolha qual delas emite os documentos de transporte.
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

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Empresa</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_fantasia}
                    {c.emitente_padrao ? " · emite CT-e" : ""}
                  </SelectItem>
                ))}
                {isAdmin && <SelectItem value={NOVA}>+ Nova empresa</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <Button variant="outline" onClick={() => setSelectedId(NOVA)}>
              <Plus className="mr-2 size-4" /> Nova empresa
            </Button>
          )}
        </CardContent>
      </Card>

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
            <label className={`block ${(!isAdmin || novaEmpresa) && "pointer-events-none opacity-60"}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="sr-only"
                onChange={handleLogoUpload}
                disabled={!isAdmin || novaEmpresa}
              />
              <div className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Upload className="size-4" />
                Enviar logo
              </div>
            </label>
            {novaEmpresa && (
              <p className="text-xs text-muted-foreground">Salve a empresa para poder enviar o logo.</p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{novaEmpresa ? "Nova empresa" : "Dados cadastrais"}</CardTitle>
            <CardDescription>Razão social, CNPJ, inscrição estadual, RNTRC e endereço</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome fantasia" id="nome_fantasia">
                <Input
                  id="nome_fantasia"
                  value={form.nome_fantasia}
                  onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                  disabled={!isAdmin}
                  placeholder="G3 Transporte Logístico"
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
              <Field label="Inscrição estadual" id="inscricao_estadual">
                <Input
                  id="inscricao_estadual"
                  value={form.inscricao_estadual}
                  onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="RNTRC" id="rntrc">
                <Input
                  id="rntrc"
                  value={form.rntrc}
                  onChange={(e) => setForm({ ...form, rntrc: e.target.value })}
                  disabled={!isAdmin}
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
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Número" id="endereco_numero">
                <Input
                  id="endereco_numero"
                  value={form.endereco_numero}
                  onChange={(e) => setForm({ ...form, endereco_numero: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="Bairro" id="bairro">
                <Input
                  id="bairro"
                  value={form.bairro}
                  onChange={(e) => setForm({ ...form, bairro: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="Cidade" id="cidade">
                <Input
                  id="cidade"
                  value={form.cidade}
                  onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="UF" id="uf">
                <Input
                  id="uf"
                  maxLength={2}
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                  disabled={!isAdmin}
                />
              </Field>
              <Field label="CEP" id="cep">
                <Input
                  id="cep"
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  disabled={!isAdmin}
                />
              </Field>
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Emite CT-e e MDF-e</div>
                  <div className="text-xs text-muted-foreground">
                    Esta empresa aparece na lista ao emitir documentos.
                  </div>
                </div>
                <Switch
                  checked={form.emitente_fiscal}
                  disabled={!isAdmin}
                  onCheckedChange={(v) =>
                    setForm({ ...form, emitente_fiscal: v, emitente_padrao: v ? form.emitente_padrao : false })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Empresa padrão para emissão</div>
                  <div className="text-xs text-muted-foreground">
                    Já vem selecionada quando você emite um documento.
                  </div>
                </div>
                <Switch
                  checked={form.emitente_padrao}
                  disabled={!isAdmin || !form.emitente_fiscal}
                  onCheckedChange={(v) => setForm({ ...form, emitente_padrao: v })}
                />
              </div>
            </div>

            {isAdmin && (
              <div className="flex justify-end">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-4" />
                  )}
                  {novaEmpresa ? "Cadastrar empresa" : "Salvar alterações"}
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
