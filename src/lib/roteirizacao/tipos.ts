/**
 * Tipos base do módulo de roteirização.
 * Mantidos isolados de UI/Supabase para permitir integração futura com
 * Google Maps, APIs de pedágio/combustível, TMS, WMS e ERPs externos.
 */

export type Coordenada = { lat: number; lng: number };

export type Entrega = {
  id: string;
  endereco: string;
  cliente?: string;
  regiao?: string;
  pesoKg: number;
  volumeM3?: number;
  /** minutos de permanência no cliente (descarga + canhoto) */
  tempoDescargaMin: number;
  /** receita prevista dessa entrega (frete) */
  receita?: number;
  /** horário limite de entrega em minutos desde o início da jornada */
  janelaFimMin?: number;
} & Partial<Coordenada>;

export type CategoriaVeiculo = "van" | "vuc" | "tres_quartos" | "toco" | "truck" | "carreta";

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
  /** velocidade média urbana/rodoviária considerada (km/h) */
  velocidadeMediaKmh: number;
  eixos: number;
  custos: CustosVeiculo;
};

export type Deposito = { endereco: string } & Coordenada;

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
  veiculo: PerfilVeiculo;
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
