import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CrmEtapa = {
  id: string;
  codigo: string;
  nome: string;
  ordem: number;
  tipo: "aberta" | "ganho" | "perdido" | string;
  cor: string;
  ativo: boolean;
};

export type CrmLead = {
  id: string;
  empresa: string;
  contato_nome: string | null;
  cargo: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  segmento: string | null;
  origem: string | null;
  cnpj_cpf: string | null;
  responsavel_id: string | null;
  potencial_faturamento: number | null;
  classificacao: string | null;
  prioridade: string;
  observacoes: string | null;
  etiquetas: string[];
  status: string;
  cliente_id: string | null;
  ultimo_contato: string | null;
  proximo_contato: string | null;
  created_by: string | null;
  created_at: string;
};

export type CrmOportunidade = {
  id: string;
  titulo: string;
  cliente_id: string | null;
  lead_id: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  valor_estimado: number;
  probabilidade: number;
  responsavel_id: string | null;
  data_prevista: string | null;
  origem: string | null;
  descricao: string | null;
  servicos: string | null;
  etapa_id: string;
  observacoes: string | null;
  motivo_perda: string | null;
  valor_fechado: number | null;
  fechada_em: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmAtividade = {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  lead_id: string | null;
  oportunidade_id: string | null;
  cliente_id: string | null;
  usuario_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export const ORIGENS_LEAD = [
  "Indicação",
  "Site",
  "WhatsApp",
  "Telefone",
  "Prospecção ativa",
  "Feira / Evento",
  "Redes sociais",
  "Outro",
];

export const SEGMENTOS = [
  "Agronegócio",
  "Alimentos e bebidas",
  "Automotivo",
  "Construção civil",
  "E-commerce",
  "Indústria",
  "Químico",
  "Varejo",
  "Outro",
];

export function useCrmEtapas() {
  return useQuery({
    queryKey: ["crm-etapas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_etapas")
        .select("*")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as CrmEtapa[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useCrmLeads() {
  return useQuery({
    queryKey: ["crm-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmLead[];
    },
  });
}

export function useCrmOportunidades() {
  return useQuery({
    queryKey: ["crm-oportunidades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_oportunidades")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmOportunidade[];
    },
  });
}

export function useCrmTimeline(filtro: { leadId?: string; oportunidadeId?: string; clienteId?: string }) {
  const { leadId, oportunidadeId, clienteId } = filtro;
  return useQuery({
    queryKey: ["crm-timeline", leadId ?? null, oportunidadeId ?? null, clienteId ?? null],
    enabled: !!(leadId || oportunidadeId || clienteId),
    queryFn: async () => {
      let q = supabase.from("crm_atividades").select("*").order("created_at", { ascending: false }).limit(100);
      if (oportunidadeId) q = q.eq("oportunidade_id", oportunidadeId);
      else if (leadId) q = q.eq("lead_id", leadId);
      else if (clienteId) q = q.eq("cliente_id", clienteId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CrmAtividade[];
    },
  });
}

/** Usuários internos que podem ser responsáveis comerciais. */
export function useUsuariosInternos() {
  return useQuery({
    queryKey: ["crm-usuarios-internos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, ativo")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string; email: string; ativo: boolean }[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useClientesSimples() {
  return useQuery({
    queryKey: ["crm-clientes-simples"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia")
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return (data ?? []) as { id: string; razao_social: string; nome_fantasia: string | null }[];
    },
    staleTime: 60_000,
  });
}

export const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
