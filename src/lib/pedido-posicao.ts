/**
 * "Pedir posição" — pedido pontual de localização para um motorista.
 *
 * Não exige nenhuma tabela nova: o pedido é registrado no canal de avisos
 * (`avisos`) com a categoria reservada abaixo, e a resposta do motorista é uma
 * mensagem no próprio aviso + o ponto gravado em `viagem_localizacoes`.
 */
import { supabase } from "@/integrations/supabase/client";

export const CATEGORIA_PEDIDO_POSICAO = "pedido_posicao";
/** Considera "posição velha" quando passou desse tempo desde o último ponto. */
export const POSICAO_OBSOLETA_MS = 5 * 60_000;
/** Pedidos mais antigos que isso são ignorados pelo app do motorista. */
export const PEDIDO_VALIDADE_MS = 30 * 60_000;

export type PedidoPosicao = {
  id: string;
  viagem_id: string | null;
  motorista_id: string | null;
  veiculo_id: string | null;
  created_at: string;
  status: string;
};

/** Cria o pedido de posição (chamado pela Central de Monitoramento). */
export async function criarPedidoPosicao(params: {
  viagemId: string;
  motoristaId: string | null;
  veiculoId: string | null;
  placa?: string | null;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre novamente.");

  const { error } = await supabase.from("avisos").insert({
    created_by: uid,
    motorista_id: params.motoristaId,
    veiculo_id: params.veiculoId,
    viagem_id: params.viagemId,
    categoria: CATEGORIA_PEDIDO_POSICAO,
    assunto: "Pedido de posição",
    mensagem: `A operação solicitou a posição atual${
      params.placa ? ` do veículo ${params.placa}` : ""
    }. O app do motorista envia automaticamente.`,
    status: "aberto",
  });
  if (error) throw error;
}

/** Pedidos abertos e recentes de um motorista. */
export async function listarPedidosAbertos(motoristaId: string): Promise<PedidoPosicao[]> {
  const desde = new Date(Date.now() - PEDIDO_VALIDADE_MS).toISOString();
  const { data, error } = await supabase
    .from("avisos")
    .select("id, viagem_id, motorista_id, veiculo_id, created_at, status")
    .eq("motorista_id", motoristaId)
    .eq("categoria", CATEGORIA_PEDIDO_POSICAO)
    .eq("status", "aberto")
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as PedidoPosicao[];
}

/**
 * Registra o atendimento. O motorista não pode alterar o status do aviso
 * (regra de integridade do canal), então respondemos com uma mensagem — a
 * operação vê a resposta e o novo ponto no mapa.
 */
export async function responderPedido(avisoId: string, texto: string) {
  const { data: userData } = await supabase.auth.getUser();
  await supabase.from("avisos_mensagens").insert({
    aviso_id: avisoId,
    autor_id: userData.user?.id ?? null,
    mensagem: texto,
  });
}
