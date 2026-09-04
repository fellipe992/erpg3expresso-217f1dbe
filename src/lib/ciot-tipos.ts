/** Tipos do CIOT (Código Identificador da Operação de Transporte). */

/**
 * bsoft   — gerado pelo mesmo emissor do CT-e/MDF-e;
 * gestora — gerado por uma gestora de pagamento de frete (Repom, Pamcary etc.);
 * manual  — gerado em canal público/portal e apenas registrado aqui.
 */
export type ProvedorCiot = "bsoft" | "gestora" | "manual";

export type StatusCiot = "rascunho" | "processando" | "emitido" | "rejeitado" | "cancelado" | "encerrado";

export type TipoContratado = "TAC" | "ETC" | "CTC";

export type EntradaCiot = {
  provedor: ProvedorCiot;
  tipoContratado: TipoContratado;
  contratadoNome: string;
  contratadoDocumento: string;
  contratadoRntrc?: string;
  valorFrete: number;
  valorAdiantamento: number;
  valorQuitacao: number;
  distanciaKm?: number;
  dataEmissao: string;
  /** Obrigatório quando o provedor é "manual". */
  numeroCiot?: string;
  observacoes?: string;
  viagemId?: string | null;
  clienteId?: string | null;
  motoristaId?: string | null;
  veiculoId?: string | null;
};

export type Ciot = {
  id: string;
  provedor: ProvedorCiot;
  status: StatusCiot;
  numero_ciot: string | null;
  protocolo: string | null;
  tipo_contratado: TipoContratado;
  contratado_nome: string;
  contratado_documento: string;
  contratado_rntrc: string | null;
  valor_frete: number;
  valor_adiantamento: number;
  valor_quitacao: number;
  distancia_km: number | null;
  data_emissao: string;
  viagem_id: string | null;
  mdfe_id: string | null;
  cliente_id: string | null;
  motorista_id: string | null;
  veiculo_id: string | null;
  motivo: string | null;
  observacoes: string | null;
  created_at: string;
  cliente?: { razao_social: string } | null;
  viagem?: { codigo: string | null } | null;
  veiculo?: { placa: string } | null;
  motorista?: { nome: string } | null;
};

export const rotuloStatusCiot: Record<StatusCiot, string> = {
  rascunho: "Rascunho",
  processando: "Processando",
  emitido: "Emitido",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  encerrado: "Encerrado",
};

export const rotuloProvedorCiot: Record<ProvedorCiot, string> = {
  bsoft: "Emissor Bsoft",
  gestora: "Gestora de frete",
  manual: "Número lançado à mão",
};
