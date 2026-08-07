import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Rota } from "@/lib/roteirizacao/tipos";

export type MotoristaOpcao = {
  id: string;
  nome: string;
  veiculo_id: string | null;
  placa: string | null;
  modelo: string | null;
  marca: string | null;
};

/** Motoristas ativos com o veículo vinculado (para preencher placa/modelo). */
export function useMotoristasComVeiculo() {
  return useQuery({
    queryKey: ["motoristas-com-veiculo"],
    queryFn: async (): Promise<MotoristaOpcao[]> => {
      const { data, error } = await supabase
        .from("motoristas")
        .select("id, nome, veiculo_id, veiculos:veiculo_id (placa, modelo, marca)")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((m) => {
        const v = (m as { veiculos: { placa: string; modelo: string; marca: string | null } | null }).veiculos;
        return {
          id: m.id,
          nome: m.nome,
          veiculo_id: m.veiculo_id,
          placa: v?.placa ?? null,
          modelo: v?.modelo ?? null,
          marca: v?.marca ?? null,
        };
      });
    },
  });
}

/** Extrai "Cidade - UF" de um endereço livre (melhor esforço). */
export function cidadeUf(endereco?: string | null): { cidade: string | null; uf: string | null } {
  if (!endereco) return { cidade: null, uf: null };
  const re = /([A-Za-zÀ-ÿ'.\s]{3,})\s*[-–/]\s*([A-Z]{2})(?=\s*(,|$|\s-\s|\d))/g;
  let m: RegExpExecArray | null;
  let ultimo: RegExpExecArray | null = null;
  while ((m = re.exec(endereco))) ultimo = m;
  if (ultimo) return { cidade: ultimo[1].trim(), uf: ultimo[2] };
  const partes = endereco.split(",").map((p) => p.trim()).filter(Boolean);
  return { cidade: partes[partes.length - 1] ?? null, uf: null };
}

export type ResultadoEnvio = { viagemId: string; codigo: string | null };

/** Atribuição pendente de uma rota (definida antes do disparo em lote). */
export type Atribuicao = { motoristaId: string; dataPrevista: string };

/** Cria uma viagem planejada com as paradas da rota e vincula o motorista. */
export async function enviarRotaParaMotorista(params: {
  rota: Rota;
  rotuloRota: string;
  motorista: MotoristaOpcao;
  dataPrevista?: string | null;
  projeto?: string;
}): Promise<ResultadoEnvio> {
  const { rota, motorista, dataPrevista, projeto, rotuloRota } = params;
  if (!rota.paradas.length) throw new Error("A rota não possui paradas");

  const { data: sessao } = await supabase.auth.getUser();
  const origem = cidadeUf(rota.deposito?.endereco ?? rota.deposito?.nome);
  const destino = cidadeUf(rota.paradas[rota.paradas.length - 1]?.entrega.endereco);

  const { data: viagem, error } = await supabase
    .from("viagens")
    .insert({
      motorista_id: motorista.id,
      veiculo_id: motorista.veiculo_id,
      origem_cidade: origem.cidade,
      origem_uf: origem.uf,
      destino_cidade: destino.cidade,
      destino_uf: destino.uf,
      data_prevista_saida: dataPrevista ? new Date(dataPrevista).toISOString() : null,
      distancia_estimada_km: Number(rota.km.toFixed(1)),
      status: "planejada",
      observacoes: `Rota programada no roteirizador${projeto ? ` — ${projeto}` : ""} · ${rotuloRota} · ${rota.paradas.length} paradas`,
      created_by: sessao.user?.id ?? null,
    })
    .select("id, codigo")
    .single();
  if (error) throw error;

  const paradas = rota.paradas.map((p) => ({
    viagem_id: viagem.id,
    ordem: p.ordem,
    cliente: p.entrega.cliente ?? null,
    endereco: p.entrega.endereco,
    nf: p.entrega.nf ?? null,
    peso_kg: p.entrega.pesoKg ?? null,
    latitude: p.entrega.lat ?? null,
    longitude: p.entrega.lng ?? null,
    chegada_prevista: p.entrega.horarioEntrega ?? null,
    tempo_descarga_min: p.entrega.tempoDescargaMin ?? null,
    observacoes: p.entrega.observacoes ?? null,
  }));

  const { error: erroParadas } = await supabase.from("viagem_paradas").insert(paradas);
  if (erroParadas) throw erroParadas;

  return { viagemId: viagem.id, codigo: viagem.codigo };
}
