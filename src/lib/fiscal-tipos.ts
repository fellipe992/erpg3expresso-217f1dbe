/** Tipos compartilhados entre a tela e as server functions da integração fiscal (Bsoft). */

export type TipoDocumentoFiscal = "cte" | "mdfe";
export type AmbienteFiscal = "homologacao" | "producao";

export const rotuloAmbiente: Record<AmbienteFiscal, string> = {
  homologacao: "Homologação (teste)",
  producao: "Produção (valendo)",
};

export type StatusDocumentoFiscal =
  | "rascunho"
  | "processando"
  | "autorizado"
  | "rejeitado"
  | "cancelado"
  | "encerrado";

export type EnderecoFiscal = {
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  complemento?: string;
};

export type EnvolvidoFiscal = {
  nome: string;
  inscricaoFederal: string;
  inscricaoEstadual?: string;
  telefone: string;
  email?: string;
  endereco: EnderecoFiscal;
};

export type AtividadeTomador =
  | "NAO_CONTRIBUINTE"
  | "INDUSTRIA"
  | "COMERCIO"
  | "AUTONOMO"
  | "SERVICO"
  | "PRODUTORRURAL"
  | "COMUNICACAO"
  | "ENERGIA"
  | "TRANSPORTE"
  | "OUTROS";

export type AdicionalFrete = { nome: string; valor: number };

export type EntradaCte = {
  empresaId?: string | null;
  ambiente?: AmbienteFiscal;
  remetente: EnvolvidoFiscal;
  destinatario: EnvolvidoFiscal;
  tomador: EnvolvidoFiscal;
  atividadeTomador: AtividadeTomador;
  freteValor: number;
  fretePeso?: number;
  pedagio?: number;
  adicionais: AdicionalFrete[];
  cargaValor: number;
  produtoPredominante: string;
  pesoKg: number;
  unidades?: number;
  chavesNfe: string[];
  observacao?: string;
  enviarEmail: boolean;
  clienteId?: string | null;
  viagemId?: string | null;
  fechamentoId?: string | null;
  veiculoId?: string | null;
  motoristaId?: string | null;
};

export type TipoCarga =
  | "CARGA_GERAL"
  | "GRANEL_SOLIDO"
  | "GRANEL_LIQUIDO"
  | "FRIGORIFICADA"
  | "CONTEINERIZADA"
  | "NEOGRANEL";

export type TipoCarroceria = "NAOAPLICAVEL" | "ABERTA" | "FECHADA_BAU" | "GRANELEIRA" | "PORTACONTAINER" | "SIDER";
export type TipoRodado = "NAOAPLICAVEL" | "TRUCK" | "TOCO" | "CAVALOMECANICO" | "VAN" | "UTILITARIO" | "OUTROS";

export type EntradaMdfe = {
  empresaId?: string | null;
  ambiente?: AmbienteFiscal;
  cteIds: string[];
  inicio: { uf: string; municipio: string };
  termino: { uf: string; municipio: string };
  ufsPercurso: string[];
  valorTotal: number;
  pesoTotalKg: number;
  produtoPredominante: string;
  tipoCarga: TipoCarga;
  tipoTransportador: "ETC" | "TAC" | "CTC";
  motorista: { nome: string; cpf: string };
  veiculo: {
    placa: string;
    uf: string;
    renavam?: string;
    tara: number;
    capacidadeKg?: number;
    tipoCarroceria: TipoCarroceria;
    tipoRodado: TipoRodado;
    propriedadeVeiculo: "PROPRIO" | "TERCEIRO";
  };
  observacao?: string;
  /** CIOT já emitido que deve constar no manifesto. */
  ciot?: string | null;
  /** Registro de CIOT deste sistema, para vincular ao manifesto gerado. */
  ciotId?: string | null;
  viagemId?: string | null;
  veiculoId?: string | null;
  motoristaId?: string | null;
};


export type DocumentoFiscal = {
  id: string;
  tipo: TipoDocumentoFiscal;
  status: StatusDocumentoFiscal;
  ambiente?: AmbienteFiscal;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  valor: number;
  ciot?: string | null;

  peso_kg: number | null;
  produto_predominante: string | null;
  motivo: string | null;
  bsoft_id: string | null;
  transacao_id: string | null;
  cliente_id: string | null;
  viagem_id: string | null;
  fechamento_id: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  observacoes: string | null;
  created_at: string;
  cliente?: { razao_social: string } | null;
  viagem?: { codigo: string | null } | null;
  veiculo?: { placa: string } | null;
  motorista?: { nome: string } | null;
};

export const rotuloStatusFiscal: Record<StatusDocumentoFiscal, string> = {
  rascunho: "Rascunho",
  processando: "Processando",
  autorizado: "Autorizado",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
  encerrado: "Encerrado",
};
