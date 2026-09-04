import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CompanySettings = {
  id: string;
  nome_fantasia: string;
  razao_social: string | null;
  cnpj: string | null;
  inscricao_estadual: string | null;
  rntrc: string | null;
  logo_url: string | null;
  endereco: string | null;
  endereco_numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
};


async function fetchCompany(): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as CompanySettings | null;
}

export function useCompany() {
  return useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompany,
    staleTime: 60_000,
  });
}

export async function getSignedLogoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from("company-assets").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
