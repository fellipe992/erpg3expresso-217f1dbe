import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Building2,
  Crosshair,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";

import { adicionarContatoCrm, buscarDecisores, salvarEmpresas } from "@/lib/hunter.functions";
import { buscarEmpresasNoNavegador } from "@/lib/hunter-places-browser";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalInput } from "@/components/planejador/local-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/app/crm/hunter")({
  head: () => ({
    meta: [
      { title: "Hunter — Prospecção B2B | G3 Expresso" },
      {
        name: "description",
        content:
          "Encontre embarcadores e distribuidores por região e localize os decisores de logística e suprimentos para o funil comercial da G3 Expresso.",
      },
      { property: "og:title", content: "Hunter — Prospecção B2B | G3 Expresso" },
      {
        property: "og:description",
        content: "Busca de empresas por região e captura de decisores de logística direto para o CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HunterPage,
});

type Empresa = {
  id: string;
  nome: string;
  endereco: string | null;
  telefone: string | null;
  website: string | null;
  cidade: string | null;
  segmento: string | null;
};

type Decisor = {
  apollo_id: string | null;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  linkedin_url: string | null;
};

const SUGESTOES = ["Indústria", "Distribuidora", "Centro de Distribuição", "Atacadista", "Alimentos"];

const CARGOS_ALVO = [
  "Gerente de Logística",
  "Coordenador de Transportes",
  "Diretor de Operações",
  "Gerente de Supply Chain",
  "Comprador",
  "Gerente de Suprimentos",
];

function HunterPage() {
  const salvarEmpresasFn = useServerFn(salvarEmpresas);
  const buscarDecisoresFn = useServerFn(buscarDecisores);
  const adicionarFn = useServerFn(adicionarContatoCrm);

  const [cidade, setCidade] = useState("");
  const [raio, setRaio] = useState("25");
  const [keyword, setKeyword] = useState("");
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selecionada, setSelecionada] = useState<Empresa | null>(null);
  const [decisores, setDecisores] = useState<Decisor[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dominio, setDominio] = useState<string | null>(null);
  const [adicionados, setAdicionados] = useState<string[]>([]);

  const busca = useMutation({
    mutationFn: async (): Promise<Empresa[]> => {
      const cidadeLimpa = cidade.trim();
      if (cidadeLimpa.length < 2) throw new Error("Informe a cidade ou região.");
      const segmento = keyword.trim() || "distribuidora atacadista indústria";
      const encontradas = await buscarEmpresasNoNavegador({
        cidade: cidadeLimpa,
        keyword: segmento,
        raioKm: Number(raio) || 25,
      });
      if (encontradas.length === 0) return [];
      const res = (await salvarEmpresasFn({
        data: { cidade: cidadeLimpa, segmento, empresas: encontradas },
      })) as { empresas: Empresa[] };
      return res.empresas ?? [];
    },
    onSuccess: (lista) => {
      setEmpresas(lista);
      if (lista.length === 0) toast.info("Nenhuma empresa encontrada para esses filtros.");
      else toast.success(`${lista.length} empresa(s) encontrada(s).`);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const decisoresMut = useMutation({
    mutationFn: (empresa: Empresa) => buscarDecisoresFn({ data: { companyId: empresa.id } }),
    onSuccess: (res) => {
      setDecisores(res.decisores as Decisor[]);
      setDominio(res.dominio ?? null);
      setAviso(res.aviso ?? null);
    },
    onError: (e: Error) => {
      setDecisores([]);
      setAviso(e.message);
    },
  });

  const addCrm = useMutation({
    mutationFn: (d: Decisor) =>
      adicionarFn({
        data: {
          companyId: selecionada!.id,
          nome: d.nome,
          cargo: d.cargo,
          email: d.email,
          telefone: d.telefone,
          linkedin_url: d.linkedin_url,
          apollo_id: d.apollo_id,
        },
      }),
    onSuccess: (_res, d) => {
      setAdicionados((prev) => [...prev, d.nome]);
      toast.success(`${d.nome} adicionado ao CRM como lead frio.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirDecisores = (empresa: Empresa) => {
    setSelecionada(empresa);
    setDecisores([]);
    setAviso(null);
    setDominio(null);
    decisoresMut.mutate(empresa);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
          <Crosshair className="size-5 text-brand" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold">Hunter</h1>
          <p className="text-sm text-muted-foreground">
            Prospecção B2B de embarcadores e distribuidores: encontre empresas por região e os decisores de logística.
          </p>
        </div>
      </div>

      {/* Etapa 1 — buscador de empresas */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Etapa 1</Badge>
            <span className="text-sm font-medium">Buscar empresas na região</span>
          </div>

          <form
            className="grid gap-3 md:grid-cols-[1.4fr_0.5fr_1.4fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busca.isPending) busca.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="hunter-cidade">Cidade / Região</Label>
              <LocalInput value={cidade} onChange={setCidade} placeholder="Ex.: Campinas, SP" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hunter-raio">Raio (km)</Label>
              <Input
                id="hunter-raio"
                type="number"
                min={1}
                max={50}
                value={raio}
                onChange={(e) => setRaio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hunter-keyword">Segmento / Palavra-chave</Label>
              <Input
                id="hunter-keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Ex.: Distribuidora de alimentos"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={busca.isPending} className="w-full md:w-auto">
                {busca.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Search className="mr-2 size-4" />
                )}
                Buscar empresas
              </Button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setKeyword(s)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-brand hover:text-brand"
              >
                {s}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {busca.isPending && (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-9 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!busca.isPending && empresas.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {empresas.map((e) => (
            <Card key={e.id} className={selecionada?.id === e.id ? "border-brand" : undefined}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 size-4 shrink-0 text-brand" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.nome}</div>
                    {e.segmento && <div className="text-xs text-muted-foreground">{e.segmento}</div>}
                  </div>
                </div>
                {e.endereco && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    <span>{e.endereco}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-4" /> {e.telefone ?? "—"}
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Globe className="size-4 shrink-0" />
                    {e.website ? (
                      <a
                        href={e.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="truncate text-brand hover:underline"
                      >
                        {e.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    ) : (
                      "sem site"
                    )}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => abrirDecisores(e)}
                  disabled={decisoresMut.isPending && selecionada?.id === e.id}
                >
                  {decisoresMut.isPending && selecionada?.id === e.id ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Users className="mr-2 size-4" />
                  )}
                  Buscar decisores
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Etapa 2 — decisores (Apollo.io) */}
      <Sheet
        open={!!selecionada}
        onOpenChange={(o) => {
          if (!o) setSelecionada(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Badge variant="outline">Etapa 2</Badge>
              {selecionada?.nome}
            </SheetTitle>
            <SheetDescription>
              {dominio ? `Decisores encontrados para ${dominio}` : "Buscando decisores de logística e suprimentos..."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-8">
            <div className="flex flex-wrap gap-1.5">
              {CARGOS_ALVO.map((c) => (
                <Badge key={c} variant="secondary" className="text-[10px] font-normal">
                  {c}
                </Badge>
              ))}
            </div>

            {decisoresMut.isPending && (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-border p-4">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-8 w-36" />
                  </div>
                ))}
              </div>
            )}

            {!decisoresMut.isPending && aviso && (
              <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">{aviso}</p>
            )}

            {!decisoresMut.isPending && !aviso && decisores.length === 0 && (
              <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                Nenhum decisor encontrado com os cargos-alvo para esta empresa.
              </p>
            )}

            {decisores.map((d, i) => {
              const jaAdicionado = adicionados.includes(d.nome);
              return (
                <div key={`${d.apollo_id ?? d.nome}-${i}`} className="space-y-2 rounded-lg border border-border p-4">
                  <div className="font-medium">{d.nome}</div>
                  {d.cargo && <div className="text-sm text-muted-foreground">{d.cargo}</div>}
                  <div className="space-y-1 text-sm">
                    <div className="text-muted-foreground">E-mail: {d.email ?? "não disponível"}</div>
                    <div className="text-muted-foreground">Telefone: {d.telefone ?? "não disponível"}</div>
                    {d.linkedin_url && (
                      <a
                        href={d.linkedin_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 text-brand hover:underline"
                      >
                        <ExternalLink className="size-3.5" /> LinkedIn
                      </a>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={jaAdicionado || addCrm.isPending}
                    onClick={() => addCrm.mutate(d)}
                  >
                    {addCrm.isPending && addCrm.variables?.nome === d.nome ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 size-4" />
                    )}
                    {jaAdicionado ? "No CRM" : "Adicionar ao CRM"}
                  </Button>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
