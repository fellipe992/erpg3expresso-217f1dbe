import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Plano } from "@/lib/roteirizacao/plano";
import type { Deposito, Entrega, PerfilVeiculo, RegrasJornada } from "@/lib/roteirizacao/tipos";

export type DadosProjeto = {
  depositos: Deposito[];
  entregas: Entrega[];
  frota: PerfilVeiculo[];
  jornada: RegrasJornada;
  plano: Plano;
};

export type ProjetoResumo = {
  id: string;
  nome: string;
  data_operacao: string | null;
  updated_at: string;
};

export function useProjetosRoteirizacao() {
  const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);
  const [projetoId, setProjetoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listar = useCallback(async () => {
    const { data, error } = await supabase
      .from("roteirizacao_projetos")
      .select("id, nome, data_operacao, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return;
    setProjetos(data ?? []);
  }, []);

  useEffect(() => {
    void listar();
  }, [listar]);

  const criar = useCallback(
    async (nome: string, dados: DadosProjeto, dataOperacao?: string) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("roteirizacao_projetos")
        .insert({
          nome,
          data_operacao: dataOperacao ?? new Date().toISOString().slice(0, 10),
          dados: dados as unknown as Record<string, unknown>,
          created_by: sessao.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) {
        toast.error("Não foi possível criar o projeto");
        return null;
      }
      setProjetoId(data.id);
      setSalvoEm(new Date().toISOString());
      void listar();
      return data.id;
    },
    [listar],
  );

  const salvar = useCallback(
    async (dados: DadosProjeto, nome?: string) => {
      if (!projetoId) return;
      setSalvando(true);
      const { error } = await supabase
        .from("roteirizacao_projetos")
        .update({ dados: dados as unknown as Record<string, unknown>, ...(nome ? { nome } : {}) })
        .eq("id", projetoId);
      setSalvando(false);
      if (error) return;
      setSalvoEm(new Date().toISOString());
      void listar();
    },
    [projetoId, listar],
  );

  /** Auto-save com debounce de 2s. */
  const autoSalvar = useCallback(
    (dados: DadosProjeto) => {
      if (!projetoId) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void salvar(dados), 2000);
    },
    [projetoId, salvar],
  );

  const carregar = useCallback(async (id: string): Promise<DadosProjeto | null> => {
    const { data, error } = await supabase
      .from("roteirizacao_projetos")
      .select("id, dados")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      toast.error("Projeto não encontrado");
      return null;
    }
    setProjetoId(data.id);
    setSalvoEm(new Date().toISOString());
    return data.dados as unknown as DadosProjeto;
  }, []);

  const excluir = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("roteirizacao_projetos").delete().eq("id", id);
      if (error) return toast.error("Não foi possível excluir o projeto");
      if (projetoId === id) setProjetoId(null);
      void listar();
      toast.success("Projeto excluído");
    },
    [projetoId, listar],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { projetos, projetoId, setProjetoId, criar, salvar, autoSalvar, carregar, excluir, salvando, salvoEm };
}
