import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Key, Loader2, Save, Settings, ShieldCheck, Upload, Building2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCompany, getSignedLogoUrl } from "@/hooks/use-company";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — G3 Expresso" }] }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const { role } = useAuth();
  if (role !== "administrador") return <Navigate to="/app" replace />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <header className="flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
          <Settings className="size-5 text-brand" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Dados da empresa, preferências, regras financeiras e notificações.
          </p>
        </div>
      </header>

      <Tabs defaultValue="empresa">
        <TabsList>
          <TabsTrigger value="empresa">Empresa</TabsTrigger>
          <TabsTrigger value="preferencias">Preferências</TabsTrigger>
          <TabsTrigger value="financeiro">Regras financeiras</TabsTrigger>
          <TabsTrigger value="notificacoes">Notificações</TabsTrigger>
          <TabsTrigger value="fiscal">
            <Key className="mr-1.5 size-4" /> Integrações fiscais
          </TabsTrigger>
        </TabsList>
        <TabsContent value="empresa" className="mt-4"><EmpresaTab /></TabsContent>
        <TabsContent value="preferencias" className="mt-4"><PreferenciasTab /></TabsContent>
        <TabsContent value="financeiro" className="mt-4"><FinanceiroTab /></TabsContent>
        <TabsContent value="notificacoes" className="mt-4"><NotificacoesTab /></TabsContent>
        <TabsContent value="fiscal" className="mt-4"><IntegracaoFiscalTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Empresa ---------------- */
function EmpresaTab() {
  const { data: company, isLoading } = useCompany();
  const qc = useQueryClient();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome_fantasia: "", razao_social: "", cnpj: "", endereco: "", telefone: "", email: "",
  });

  useEffect(() => {
    if (company) {
      setForm({
        nome_fantasia: company.nome_fantasia ?? "",
        razao_social: company.razao_social ?? "",
        cnpj: company.cnpj ?? "",
        endereco: company.endereco ?? "",
        telefone: company.telefone ?? "",
        email: company.email ?? "",
      });
      getSignedLogoUrl(company.logo_url).then(setLogoPreview);
    }
  }, [company]);

  const save = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Configuração não carregada");
      const { error } = await supabase.from("company_settings").update(form).eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Dados atualizados");
      qc.invalidateQueries({ queryKey: ["company-settings"] });
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !company) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Arquivo muito grande (máx 2MB)");
    const ext = file.name.split(".").pop() ?? "png";
    const path = `logos/logo-${Date.now()}.${ext}`;
    const { error: up } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true, contentType: file.type });
    if (up) return toast.error("Erro no upload", { description: up.message });
    const { error } = await supabase.from("company_settings").update({ logo_url: path }).eq("id", company.id);
    if (error) return toast.error("Erro ao salvar logo", { description: error.message });
    toast.success("Logo atualizado");
    qc.invalidateQueries({ queryKey: ["company-settings"] });
    getSignedLogoUrl(path).then(setLogoPreview);
  }

  if (isLoading) return <Spinner />;

  return (
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
          <label className="block">
            <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" onChange={handleLogo} />
            <div className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Upload className="size-4" /> Enviar logo
            </div>
          </label>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Dados cadastrais</CardTitle>
          <CardDescription>Aparecem em relatórios e nas telas do sistema.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome fantasia"><Input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} /></Field>
            <Field label="Razão social"><Input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} /></Field>
            <Field label="CNPJ"><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></Field>
            <Field label="Telefone"><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <Field label="Endereço"><Textarea rows={2} value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} /></Field>
          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Salvar alterações
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- System settings shared ---------------- */
type SystemSettings = {
  id: string;
  timezone: string;
  moeda: string;
  casas_decimais: number;
  default_theme: string;
  dias_alerta_vencer: number;
  dias_alerta_atraso: number;
  prazo_padrao_vencimento: number;
  notif_config: Record<string, Record<string, boolean>>;
};

function useSystemSettings() {
  return useQuery({
    queryKey: ["system-settings"],
    queryFn: async (): Promise<SystemSettings | null> => {
      const { data, error } = await supabase.from("system_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as SystemSettings | null;
    },
  });
}

function useSaveSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<SystemSettings> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("system_settings").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["system-settings"] });
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });
}

/* ---------------- Preferências ---------------- */
function PreferenciasTab() {
  const { data, isLoading } = useSystemSettings();
  const save = useSaveSystemSettings();
  const [form, setForm] = useState({ timezone: "", moeda: "BRL", casas_decimais: 2, default_theme: "system" });

  useEffect(() => {
    if (data) setForm({
      timezone: data.timezone,
      moeda: data.moeda,
      casas_decimais: data.casas_decimais,
      default_theme: data.default_theme,
    });
  }, [data]);

  if (isLoading || !data) return <Spinner />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferências do sistema</CardTitle>
        <CardDescription>Valores padrão aplicados nas exibições e relatórios.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Fuso horário">
            <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</SelectItem>
                <SelectItem value="America/Manaus">America/Manaus (GMT-4)</SelectItem>
                <SelectItem value="America/Rio_Branco">America/Rio_Branco (GMT-5)</SelectItem>
                <SelectItem value="America/Fortaleza">America/Fortaleza (GMT-3)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tema padrão">
            <Select value={form.default_theme} onValueChange={(v) => setForm({ ...form, default_theme: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Sistema</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
                <SelectItem value="dark">Escuro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Moeda">
            <Select value={form.moeda} onValueChange={(v) => setForm({ ...form, moeda: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">Real (R$)</SelectItem>
                <SelectItem value="USD">Dólar (US$)</SelectItem>
                <SelectItem value="EUR">Euro (€)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Casas decimais">
            <Input type="number" min={0} max={4} value={form.casas_decimais}
              onChange={(e) => setForm({ ...form, casas_decimais: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate({ id: data.id, ...form })} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />} Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Financeiro ---------------- */
function FinanceiroTab() {
  const { data, isLoading } = useSystemSettings();
  const save = useSaveSystemSettings();
  const [form, setForm] = useState({ dias_alerta_vencer: 7, dias_alerta_atraso: 3, prazo_padrao_vencimento: 30 });

  useEffect(() => {
    if (data) setForm({
      dias_alerta_vencer: data.dias_alerta_vencer,
      dias_alerta_atraso: data.dias_alerta_atraso,
      prazo_padrao_vencimento: data.prazo_padrao_vencimento,
    });
  }, [data]);

  if (isLoading || !data) return <Spinner />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras financeiras</CardTitle>
        <CardDescription>Prazos padrão e limites usados em alertas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Prazo padrão de vencimento (dias)">
            <Input type="number" min={0} value={form.prazo_padrao_vencimento}
              onChange={(e) => setForm({ ...form, prazo_padrao_vencimento: Number(e.target.value) })} />
          </Field>
          <Field label="Alerta 'a vencer' em (dias)">
            <Input type="number" min={1} value={form.dias_alerta_vencer}
              onChange={(e) => setForm({ ...form, dias_alerta_vencer: Number(e.target.value) })} />
          </Field>
          <Field label="Alerta 'atrasado' após (dias)">
            <Input type="number" min={0} value={form.dias_alerta_atraso}
              onChange={(e) => setForm({ ...form, dias_alerta_atraso: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate({ id: data.id, ...form })} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />} Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Notificações ---------------- */
const NOTIF_MATRIX: { role: string; label: string; events: { key: string; label: string }[] }[] = [
  { role: "motorista", label: "Motorista", events: [
    { key: "nova_viagem", label: "Nova viagem atribuída" },
    { key: "atualizacao_viagem", label: "Alteração em viagem em andamento" },
  ]},
  { role: "financeiro", label: "Financeiro", events: [
    { key: "vencendo", label: "Lançamentos vencendo" },
    { key: "atrasado", label: "Lançamentos atrasados" },
  ]},
  { role: "gestor", label: "Gestor", events: [
    { key: "manutencao", label: "Manutenções agendadas" },
    { key: "ocorrencia", label: "Ocorrências em viagens" },
  ]},
  { role: "administrador", label: "Administrador", events: [
    { key: "tudo", label: "Todos os eventos" },
  ]},
];

function NotificacoesTab() {
  const { data, isLoading } = useSystemSettings();
  const save = useSaveSystemSettings();
  const [cfg, setCfg] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    if (data) setCfg(data.notif_config ?? {});
  }, [data]);

  if (isLoading || !data) return <Spinner />;

  const toggle = (r: string, ev: string, v: boolean) =>
    setCfg((c) => ({ ...c, [r]: { ...(c[r] ?? {}), [ev]: v } }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notificações por perfil</CardTitle>
        <CardDescription>Ative/desative as notificações enviadas em tempo real e no sino.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {NOTIF_MATRIX.map((r) => (
          <div key={r.role}>
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{r.label}</div>
            <div className="space-y-2 rounded-lg border p-3">
              {r.events.map((ev) => (
                <div key={ev.key} className="flex items-center justify-between">
                  <div className="text-sm">{ev.label}</div>
                  <Switch
                    checked={cfg[r.role]?.[ev.key] ?? false}
                    onCheckedChange={(v) => toggle(r.role, ev.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex justify-end">
          <Button onClick={() => save.mutate({ id: data.id, notif_config: cfg })} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />} Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Integrações fiscais (Bsoft/Hivecloud) ---------------- */
type FiscalIntegracaoConfig = {
  id: string;
  bsoft_usuario_api: string | null;
  bsoft_api_token: string | null;
  bsoft_tenant_id: string | null;
  bsoft_api_token_mdfe: string | null;
  bsoft_tenant_id_mdfe: string | null;
  bsoft_api_token_homologacao: string | null;
  bsoft_tenant_id_homologacao: string | null;
};

const FISCAL_COLS =
  "id, bsoft_usuario_api, bsoft_api_token, bsoft_tenant_id, bsoft_api_token_mdfe, bsoft_tenant_id_mdfe, bsoft_api_token_homologacao, bsoft_tenant_id_homologacao";

function useFiscalIntegracaoConfig() {
  return useQuery({
    queryKey: ["fiscal-integracao-config"],
    queryFn: async (): Promise<FiscalIntegracaoConfig | null> => {
      const { data, error } = await supabase
        .from("fiscal_integracao_config")
        .select(FISCAL_COLS)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as FiscalIntegracaoConfig | null;
    },
  });
}

function useSaveFiscalIntegracaoConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<FiscalIntegracaoConfig> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase.from("fiscal_integracao_config").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Credenciais fiscais salvas");
      qc.invalidateQueries({ queryKey: ["fiscal-integracao-config"] });
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });
}

function IntegracaoFiscalTab() {
  const { data, isLoading } = useFiscalIntegracaoConfig();
  const save = useSaveFiscalIntegracaoConfig();
  const [form, setForm] = useState({
    bsoft_usuario_api: "",
    bsoft_api_token: "",
    bsoft_tenant_id: "",
    bsoft_api_token_mdfe: "",
    bsoft_tenant_id_mdfe: "",
    bsoft_api_token_homologacao: "",
    bsoft_tenant_id_homologacao: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        bsoft_usuario_api: data.bsoft_usuario_api ?? "",
        bsoft_api_token: data.bsoft_api_token ?? "",
        bsoft_tenant_id: data.bsoft_tenant_id ?? "",
        bsoft_api_token_mdfe: data.bsoft_api_token_mdfe ?? "",
        bsoft_tenant_id_mdfe: data.bsoft_tenant_id_mdfe ?? "",
        bsoft_api_token_homologacao: data.bsoft_api_token_homologacao ?? "",
        bsoft_tenant_id_homologacao: data.bsoft_tenant_id_homologacao ?? "",
      });
    }
  }, [data]);

  if (isLoading || !data) return <Spinner />;

  const limpar = (v: string) => v.trim();
  const cteOk = !!form.bsoft_api_token && !!form.bsoft_tenant_id;
  const mdfeOk = !!form.bsoft_api_token_mdfe && !!form.bsoft_tenant_id_mdfe;
  const homOk = !!form.bsoft_api_token_homologacao && !!form.bsoft_tenant_id_homologacao;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="size-5 text-brand" />
            <CardTitle>Usuário de API</CardTitle>
          </div>
          <CardDescription>E-mail do usuário de integração cadastrado na Bsoft.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field label="Usuário de API">
            <Input
              value={form.bsoft_usuario_api}
              onChange={(e) => setForm({ ...form, bsoft_usuario_api: e.target.value })}
              placeholder="usuario@empresa.com.br"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="size-5 text-brand" />
            <CardTitle>CT-e (produção)</CardTitle>
          </div>
          <CardDescription>Credenciais usadas para emitir CT-e e CIOT.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cteOk && (
            <Badge variant="outline" className="border-emerald-500/60 text-emerald-600">
              <ShieldCheck className="mr-1 size-3" /> Configurado
            </Badge>
          )}
          <Field label="Token do CT-e">
            <Input
              type="password"
              value={form.bsoft_api_token}
              onChange={(e) => setForm({ ...form, bsoft_api_token: limpar(e.target.value) })}
              placeholder="Cole o token de integração do CT-e"
            />
          </Field>
          <Field label="Tenant ID do CT-e">
            <Input
              value={form.bsoft_tenant_id}
              onChange={(e) => setForm({ ...form, bsoft_tenant_id: limpar(e.target.value) })}
              placeholder="Ex: 978997c3-4960-4cda-a9a0-906cd6d62677"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="size-5 text-brand" />
            <CardTitle>MDF-e (produção)</CardTitle>
          </div>
          <CardDescription>O MDF-e tem token e tenant próprios na Bsoft.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mdfeOk && (
            <Badge variant="outline" className="border-emerald-500/60 text-emerald-600">
              <ShieldCheck className="mr-1 size-3" /> Configurado
            </Badge>
          )}
          <Field label="Token do MDF-e">
            <Input
              type="password"
              value={form.bsoft_api_token_mdfe}
              onChange={(e) => setForm({ ...form, bsoft_api_token_mdfe: limpar(e.target.value) })}
              placeholder="Cole o token de integração do MDF-e"
            />
          </Field>
          <Field label="Tenant ID do MDF-e">
            <Input
              value={form.bsoft_tenant_id_mdfe}
              onChange={(e) => setForm({ ...form, bsoft_tenant_id_mdfe: limpar(e.target.value) })}
              placeholder="Ex: c20485f4-89e0-4c1f-8651-2c2d4af118059"
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="size-5 text-amber-500" />
            <CardTitle>Homologação (teste)</CardTitle>
          </div>
          <CardDescription>Se deixar em branco, o ambiente de teste usa as credenciais de produção.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {homOk && (
            <Badge variant="outline" className="border-amber-500/60 text-amber-600 sm:col-span-2">
              Configurado separadamente
            </Badge>
          )}
          <Field label="Token de homologação">
            <Input
              type="password"
              value={form.bsoft_api_token_homologacao}
              onChange={(e) => setForm({ ...form, bsoft_api_token_homologacao: limpar(e.target.value) })}
              placeholder="Token de teste (opcional)"
            />
          </Field>
          <Field label="Tenant ID de homologação">
            <Input
              value={form.bsoft_tenant_id_homologacao}
              onChange={(e) => setForm({ ...form, bsoft_tenant_id_homologacao: limpar(e.target.value) })}
              placeholder="Opcional"
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Estes dados são visíveis apenas para administradores. Cada produto (CT-e e MDF-e) tem token e tenant
              próprios — usar o par errado faz a Bsoft recusar a conexão.
            </p>
            <Button onClick={() => save.mutate({ id: data.id, ...form })} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              Salvar credenciais
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


/* ---------------- helpers ---------------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
function Spinner() {
  return (
    <div className="grid min-h-[30vh] place-items-center">
      <Loader2 className="size-6 animate-spin text-brand" />
    </div>
  );
}
