/**
 * Tipos base do módulo de roteirização.
 * Mantidos isolados de UI/Supabase para permitir integração futura com
 * Google Maps, APIs de pedágio/combustível, TMS, WMS e ERPs externos.
 */

export type Coordenada = { lat: number; lng: number };

export type CodigoRegiao = "norte" | "sul" | "leste" | "oeste" | "centro";

export type Entrega = {
  id: string;
  /** número da nota fiscal */
  nf?: string;
  endereco: string;
  cliente?: string;
  /** rótulo da região identificada automaticamente (ex.: "Zona Norte") */
  regiao?: string;
  /** código da região usado para cor do marcador */
  regiaoCodigo?: CodigoRegiao;
  /** CD de origem associado */
  depositoId?: string;
  pesoKg: number;
  volumeM3?: number;
  /** minutos de permanência no cliente (descarga + canhoto) */
  tempoDescargaMin: number;
  observacoes?: string;
  /** horário limite de entrega no formato HH:MM */
  horarioEntrega?: string;
  /** horário limite de entrega em minutos desde o início da jornada */
  janelaFimMin?: number;
  /** como a entrega entrou na rota — usado para auditoria da roteirização */
  origemAlocacao?: OrigemAlocacao;
} & Partial<Coordenada>;

/**
 * zona        → alocada na formação normal da rota (mesma região)
 * proximidade → puxada de outra zona por estar próxima da rota
 * sobra       → encaixada na passada final de reaproveitamento
 * consolidacao→ realocada na pós-otimização (redução de veículos ociosos)
 * manual      → movida pelo usuário
 */
export type OrigemAlocacao = "zona" | "proximidade" | "sobra" | "consolidacao" | "manual";

/** Modo de escolha da próxima entrega ao montar a rota. */
export type ModoOtimizacao = "insercao" | "setor";

export type OpcoesOtimizacao = {
  /**
   * "insercao": escolhe a próxima entrega pelo menor aumento de distância
   * (custo de inserção) respeitando a capacidade por peso.
   * "setor": agrupamento geográfico clássico (sweep).
   */
  modo: ModoOtimizacao;
  /** ignora cubagem (m³) e usa apenas o peso como limitador de capacidade */
  ignorarCubagem: boolean;
  /** executa a pós-otimização que realoca rotas com baixa ocupação */
  consolidarRotas: boolean;
  /** ocupação de peso mínima aceitável (0-1) antes de tentar dissolver a rota */
  ocupacaoMinima: number;
};

export type CategoriaVeiculo =
  | "fiorino"
  | "van"
  | "hr"
  | "vuc"
  | "tres_quartos"
  | "toco"
  | "truck"
  | "carreta";

export type CustosVeiculo = {
  consumoKmL: number;
  precoCombustivel: number;
  pedagioPorKm: number;
  salarioDiario: number;
  custoHora: number;
  manutencaoKm: number;
  depreciacaoKm: number;
  seguroDia: number;
  pneusKm: number;
  outrosKm: number;
};

export type PerfilVeiculo = {
  id: string;
  nome: string;
  categoria: CategoriaVeiculo;
  capacidadeKg: number;
  capacidadeM3: number;
  /** quantidade disponível na frota */
  disponiveis: number;
  /** limite opcional de entregas por rota */
  maxEntregas?: number;
  /** velocidade média urbana/rodoviária considerada (km/h) */
  velocidadeMediaKmh: number;
  eixos: number;
  custos: CustosVeiculo;
};

export type Deposito = {
  id: string;
  nome: string;
  endereco: string;
} & Coordenada;

export type RegrasJornada = {
  maxDirecaoContinuaMin: number;
  intervaloMin: number;
  almocoMin: number;
  maxDiarioMin: number;
  toleranciaHoraExtraMin: number;
};

export type ParadaRota = {
  entrega: Entrega;
  ordem: number;
  kmAcumulado: number;
  chegadaMin: number;
  saidaMin: number;
  atrasada: boolean;
};

export type CustoDetalhado = {
  combustivel: number;
  pedagio: number;
  motorista: number;
  hora: number;
  manutencao: number;
  depreciacao: number;
  seguro: number;
  pneus: number;
  outros: number;
  total: number;
};

export type Rota = {
  id: string;
  rotulo?: string;
  veiculo: PerfilVeiculo;
  /** CD de saída desta rota */
  deposito?: Deposito;
  paradas: ParadaRota[];
  km: number;
  minutos: number;
  minutosDirecao: number;
  minutosParado: number;
  pesoKg: number;
  volumeM3: number;
  ocupacaoPeso: number;
  custo: CustoDetalhado;
  receita: number;
  alertasJornada: string[];
};

export type TipoCenario = "custo" | "tempo" | "ocupacao" | "km" | "balanceado";

export type Cenario = {
  id: TipoCenario;
  nome: string;
  objetivo: string;
  rotas: Rota[];
  veiculos: number;
  km: number;
  minutos: number;
  /** duração da operação (maior rota, pois os veículos rodam em paralelo) */
  minutosOperacao: number;
  pesoKg: number;
  custo: number;
  custoDetalhado: CustoDetalhado;
  receita: number;
  ocupacaoMedia: number;
  entregasAtendidas: number;
  entregasNaoAtendidas: Entrega[];
  score: number;
  recomendado: boolean;
};

export type ResultadoSimulacao = {
  cenarios: Cenario[];
  recomendado: TipoCenario;
};
