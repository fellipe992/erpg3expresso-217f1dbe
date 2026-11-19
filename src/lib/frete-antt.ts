/**
 * Piso mínimo de frete da ANTT (Lei 13.703/2018, Resolução ANTT 5.867/2020).
 * Coeficientes do Anexo II na redação da Resolução ANTT 6.084, de 16/07/2026.
 * Ao reajustar, acrescente uma nova versão em VERSOES_ANTT (nunca altere a anterior).
 */
export type TabelaAntt = "A" | "B" | "C" | "D";
export type TipoCargaAntt =
  | "granel_solido" | "granel_liquido" | "frigorificada" | "conteinerizada" | "carga_geral" | "neogranel"
  | "perigosa_granel_solido" | "perigosa_granel_liquido" | "perigosa_frigorificada" | "perigosa_conteinerizada"
  | "perigosa_carga_geral" | "granel_pressurizada";
export type Eixos = 2 | 3 | 4 | 5 | 6 | 7 | 9;
export const EIXOS: Eixos[] = [2, 3, 4, 5, 6, 7, 9];

export const TIPOS_CARGA: { id: TipoCargaAntt; nome: string; exemplo: string }[] = [
  { id: "carga_geral", nome: "Carga geral", exemplo: "Caixas, volumes, mercadorias embaladas" },
  { id: "granel_solido", nome: "Granel sólido", exemplo: "Grãos, areia, minério, fertilizante" },
  { id: "granel_liquido", nome: "Granel líquido", exemplo: "Combustível, óleo, leite em tanque" },
  { id: "frigorificada", nome: "Frigorificada ou aquecida", exemplo: "Alimentos refrigerados/congelados" },
  { id: "conteinerizada", nome: "Conteinerizada", exemplo: "Contêiner (mín. 3 eixos)" },
  { id: "neogranel", nome: "Neogranel", exemplo: "Bobinas, sacarias, toras, veículos" },
  { id: "granel_pressurizada", nome: "Granel pressurizada", exemplo: "Gases e cimento a granel pressurizado" },
  { id: "perigosa_carga_geral", nome: "Perigosa (carga geral)", exemplo: "Produtos perigosos embalados" },
  { id: "perigosa_granel_solido", nome: "Perigosa (granel sólido)", exemplo: "" },
  { id: "perigosa_granel_liquido", nome: "Perigosa (granel líquido)", exemplo: "" },
  { id: "perigosa_frigorificada", nome: "Perigosa (frigorificada ou aquecida)", exemplo: "" },
  { id: "perigosa_conteinerizada", nome: "Perigosa (conteinerizada)", exemplo: "" },
];

export const TABELAS: { id: TabelaAntt; nome: string; descricao: string }[] = [
  { id: "A", nome: "Tabela A — Lotação", descricao: "Contrata o conjunto completo (veículo + implemento) para uma carga lotação." },
  { id: "B", nome: "Tabela B — Só o veículo automotor", descricao: "Contrata apenas o cavalo/caminhão; o implemento é do contratante." },
  { id: "C", nome: "Tabela C — Lotação de alto desempenho", descricao: "Lotação com alta produtividade (carga/descarga rápida, retorno carregado)." },
  { id: "D", nome: "Tabela D — Só o automotor, alto desempenho", descricao: "Apenas o automotor, em operação de alto desempenho." },
];

/** [CCD R$/km, CC R$] por eixos carregados. Célula ausente = combinação não prevista pela ANTT. */
type Coef = Partial<Record<Eixos, [number, number]>>;
export type VersaoAntt = { resolucao: string; vigenciaInicio: string; tabelas: Record<TabelaAntt, Record<TipoCargaAntt, Coef>> };

export const VERSOES_ANTT: VersaoAntt[] = [
  {
    resolucao: "Resolução ANTT nº 6.084/2026",
    vigenciaInicio: "2026-07-16",
    tabelas: {
      A: {
        granel_solido: { 2: [4.0144, 460.59], 3: [5.1355, 552.24], 4: [5.8118, 597.0], 5: [6.6983, 664.83], 6: [7.3841, 680.01], 7: [8.0516, 820.34], 9: [9.2231, 908.91] },
        granel_liquido: { 2: [4.0884, 471.98], 3: [5.2311, 569.57], 4: [5.9661, 621.52], 5: [6.8661, 693.08], 6: [7.5572, 709.72], 7: [8.19, 840.5], 9: [9.3822, 934.76] },
        frigorificada: { 2: [4.7095, 520.07], 3: [6.0159, 623.27], 4: [6.8646, 686.63], 5: [7.8666, 757.98], 6: [8.6661, 772.35], 7: [9.5884, 982.76], 9: [10.887, 1067.06] },
        conteinerizada: { 3: [5.1082, 544.75], 4: [5.7396, 577.15], 5: [6.6345, 647.29], 6: [7.3186, 662.01], 7: [8.0492, 819.69], 9: [9.1399, 886.05] },
        carga_geral: { 2: [3.9826, 451.84], 3: [5.0977, 541.86], 4: [5.7822, 588.86], 5: [6.6718, 657.56], 6: [7.3547, 671.93], 7: [8.0927, 831.66], 9: [9.2027, 903.32] },
        neogranel: { 2: [3.6023, 451.84], 3: [5.0962, 541.44], 4: [5.8094, 596.35], 5: [6.6718, 657.56], 6: [7.3547, 671.93], 7: [8.0927, 831.66], 9: [9.2027, 903.32] },
        perigosa_granel_solido: { 2: [4.7845, 608.79], 3: [5.9154, 703.16], 4: [6.6285, 753.03], 5: [7.515, 820.86], 6: [8.2008, 836.04], 7: [8.8866, 981.39], 9: [10.066, 1072.15] },
        perigosa_granel_liquido: { 2: [4.871, 632.58], 3: [6.0236, 732.9], 4: [6.7628, 789.96], 5: [7.6628, 861.51], 6: [8.3539, 878.16], 7: [9.0049, 1013.95], 9: [10.2051, 1110.41] },
        perigosa_frigorificada: { 2: [5.3176, 630.88], 3: [6.6369, 737.63], 4: [7.502, 807.63], 5: [8.5039, 878.98], 6: [9.3034, 893.35], 7: [10.2495, 1110.28], 9: [11.5584, 1197.43] },
        perigosa_conteinerizada: { 3: [5.4926, 645.45], 4: [6.1608, 682.95], 5: [7.0556, 753.1], 6: [7.7398, 767.81], 7: [8.4886, 930.51], 9: [9.5873, 999.06] },
        perigosa_carga_geral: { 2: [4.3571, 549.81], 3: [5.4821, 642.55], 4: [6.2033, 694.66], 5: [7.093, 763.36], 6: [7.7758, 777.73], 7: [8.5321, 942.48], 9: [9.6501, 1016.33] },
        granel_pressurizada: { 5: [7.0364, 757.81], 6: [7.7652, 784.82], 9: [9.7444, 1052.26] },
      },
      B: {
        granel_solido: { 4: [5.218, 533.4], 5: [5.9334, 594.62], 6: [6.6063, 608.99], 7: [7.0381, 720.31], 9: [7.8292, 773.22] },
        granel_liquido: { 4: [5.2831, 533.4], 5: [5.9986, 594.62], 6: [6.6714, 608.99], 7: [7.1032, 720.31], 9: [7.8943, 773.22] },
        frigorificada: { 4: [6.129, 584.04], 5: [6.9472, 645.26], 6: [7.7367, 659.62], 7: [8.1867, 775.96], 9: [9.1284, 831.06] },
        conteinerizada: { 4: [5.218, 533.4], 5: [5.9334, 594.62], 6: [6.6063, 608.99], 7: [7.0381, 720.31], 9: [7.8292, 773.22] },
        carga_geral: { 4: [5.218, 533.4], 5: [5.9334, 594.62], 6: [6.6063, 608.99], 7: [7.0381, 720.31], 9: [7.8292, 773.22] },
        neogranel: { 4: [5.218, 533.4], 5: [5.9334, 594.62], 6: [6.6063, 608.99], 7: [7.0381, 720.31], 9: [7.8292, 773.22] },
        perigosa_granel_solido: { 4: [6.0347, 689.44], 5: [6.7502, 750.65], 6: [7.423, 765.02], 7: [7.873, 881.36], 9: [8.6721, 936.46] },
        perigosa_granel_liquido: { 4: [6.0798, 701.84], 5: [6.7953, 763.06], 6: [7.4681, 777.43], 7: [7.9181, 893.76], 9: [8.7172, 948.87] },
        perigosa_frigorificada: { 4: [6.7663, 705.04], 5: [7.5845, 766.25], 6: [8.374, 780.62], 7: [8.8477, 903.48], 9: [9.7997, 961.43] },
        perigosa_conteinerizada: { 4: [5.6391, 639.21], 5: [6.3546, 700.42], 6: [7.0274, 714.79], 7: [7.4774, 831.13], 9: [8.2766, 886.23] },
        perigosa_carga_geral: { 4: [5.6391, 639.21], 5: [6.3546, 700.42], 6: [7.0274, 714.79], 7: [7.4774, 831.13], 9: [8.2766, 886.23] },
        granel_pressurizada: { 5: [5.9334, 594.62], 6: [6.6063, 608.99], 9: [7.8292, 773.22] },
      },
      C: {
        granel_solido: { 2: [3.3964, 174.38], 3: [4.3276, 198.05], 4: [4.9441, 215.03], 5: [5.6725, 229.64], 6: [6.3229, 232.91], 7: [6.7071, 270.36], 9: [7.6912, 292.59] },
        granel_liquido: { 2: [3.4439, 176.84], 3: [4.3828, 201.78], 4: [5.0412, 220.31], 5: [5.7745, 235.73], 6: [6.4268, 239.32], 7: [6.7985, 274.7], 9: [7.7901, 298.16] },
        frigorificada: { 2: [4.0647, 205.65], 3: [5.1615, 232.97], 4: [5.9203, 256.16], 5: [6.756, 271.54], 6: [7.522, 274.63], 7: [8.0108, 329.34], 9: [9.1377, 351.6] },
        conteinerizada: { 3: [4.3178, 196.43], 4: [4.9182, 210.75], 5: [5.6496, 225.87], 6: [6.2994, 229.04], 7: [6.7062, 270.22], 9: [7.6614, 287.67] },
        carga_geral: { 2: [3.385, 172.5], 3: [4.3141, 195.81], 4: [4.9335, 213.27], 5: [5.663, 228.08], 6: [6.3124, 231.17], 7: [6.7218, 272.8], 9: [7.6839, 291.39] },
        neogranel: { 2: [3.0047, 172.5], 3: [4.3135, 195.72], 4: [4.9432, 214.89], 5: [5.663, 228.08], 6: [6.3124, 231.17], 7: [6.7218, 272.8], 9: [7.6839, 291.39] },
        perigosa_granel_solido: { 2: [3.9329, 224.77], 3: [4.8748, 250.19], 4: [5.5294, 270.47], 5: [6.2578, 285.09], 6: [6.9083, 288.36], 7: [7.3121, 329.05], 9: [8.3048, 352.7] },
        perigosa_granel_liquido: { 2: [3.964, 229.89], 3: [4.9136, 256.6], 4: [5.5777, 278.43], 5: [6.3109, 293.85], 6: [6.9633, 297.43], 7: [7.3546, 336.06], 9: [8.3548, 360.94] },
        perigosa_frigorificada: { 2: [4.5599, 253.51], 3: [5.6705, 283.12], 4: [6.4476, 310.6], 5: [7.2833, 325.98], 6: [8.0493, 329.07], 7: [8.5636, 388.0], 9: [9.7016, 412.1] },
        perigosa_conteinerizada: { 3: [4.5865, 237.75], 4: [5.225, 255.37], 5: [5.9564, 270.49], 6: [6.6062, 273.66], 7: [7.0327, 318.08], 9: [7.9965, 336.95] },
        perigosa_carga_geral: { 2: [3.643, 212.06], 3: [4.5827, 237.13], 4: [5.2403, 257.89], 5: [5.9698, 272.7], 6: [6.6192, 275.79], 7: [7.0483, 320.66], 9: [8.019, 340.67] },
        granel_pressurizada: { 5: [5.7939, 249.68], 6: [6.4598, 255.5], 9: [7.8784, 323.48] },
      },
      D: {
        granel_solido: { 4: [4.4985, 201.32], 5: [5.0713, 214.52], 6: [5.7107, 217.61], 7: [5.9267, 248.8], 9: [6.6136, 263.35] },
        granel_liquido: { 4: [4.5636, 201.32], 5: [5.1364, 214.52], 6: [5.7758, 217.61], 7: [5.9918, 248.8], 9: [6.6787, 263.35] },
        frigorificada: { 4: [5.4237, 234.06], 5: [6.0993, 247.25], 6: [6.8553, 250.34], 7: [7.091, 284.78], 9: [7.929, 300.75] },
        conteinerizada: { 4: [4.4985, 201.32], 5: [5.0713, 214.52], 6: [5.7107, 217.61], 7: [5.9267, 248.8], 9: [6.6136, 263.35] },
        carga_geral: { 4: [4.4985, 201.32], 5: [5.0713, 214.52], 6: [5.7107, 217.61], 7: [5.9267, 248.8], 9: [6.6136, 263.35] },
        neogranel: { 4: [4.4985, 201.32], 5: [5.0713, 214.52], 6: [5.7107, 217.61], 7: [5.9267, 248.8], 9: [6.6136, 263.35] },
        perigosa_granel_solido: { 4: [5.0838, 256.77], 5: [5.6566, 269.96], 6: [6.296, 273.05], 7: [6.5317, 307.49], 9: [7.2272, 323.46] },
        perigosa_granel_liquido: { 4: [5.1, 259.44], 5: [5.6728, 272.63], 6: [6.3122, 275.73], 7: [6.5479, 310.16], 9: [7.2434, 326.13] },
        perigosa_frigorificada: { 4: [5.951, 288.5], 5: [6.6265, 301.69], 6: [7.3826, 304.78], 7: [7.6438, 343.44], 9: [8.493, 361.25] },
        perigosa_conteinerizada: { 4: [4.8053, 245.95], 5: [5.3781, 259.14], 6: [6.0175, 262.23], 7: [6.2532, 296.67], 9: [6.9487, 312.64] },
        perigosa_carga_geral: { 4: [4.8053, 245.95], 5: [5.3781, 259.14], 6: [6.0175, 262.23], 7: [6.2532, 296.67], 9: [6.9487, 312.64] },
        granel_pressurizada: { 5: [5.0713, 214.52], 6: [5.7107, 217.61], 9: [6.6136, 263.35] },
      },
    },
  },
];

/** Fator aplicado ao CCD no trecho de retorno vazio (Res. 5.867/2020, art. 5º). */
export const FATOR_RETORNO_VAZIO = 0.92;

export function versaoVigente(data: string = new Date().toISOString().slice(0, 10)): VersaoAntt {
  const ord = [...VERSOES_ANTT].sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio));
  return ord.find((v) => v.vigenciaInicio <= data) ?? ord[ord.length - 1];
}

/** Eixos típicos por categoria de veículo cadastrada (o usuário pode trocar). */
export function eixosSugeridos(tipoVeiculo: string | null | undefined): Eixos {
  switch ((tipoVeiculo ?? "").toLowerCase()) {
    case "truck": return 3;
    case "carreta": case "cavalo": return 5;
    case "bitrem": return 7;
    case "rodotrem": return 9;
    default: return 2; // fiorino, van, vuc, utilitário, 3/4, toco
  }
}

export type EntradaPiso = {
  lotacao: boolean;
  tabela: TabelaAntt;
  tipoCarga: TipoCargaAntt;
  eixos: Eixos;
  km: number;
  retornoVazio?: boolean;
  kmRetorno?: number;
  freteCombinado?: number | null;
  data?: string;
};

export type ResultadoPiso =
  | { aplica: false; motivo: string }
  | {
      aplica: true; resolucao: string; ccd: number; cc: number;
      valorDeslocamento: number; valorRetorno: number; piso: number;
      freteCombinado: number | null; diferenca: number | null; dentroDoPiso: boolean | null;
    };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcularPisoAntt(e: EntradaPiso): ResultadoPiso {
  if (!e.lotacao) return { aplica: false, motivo: "Carga fracionada (várias notas/contratantes no mesmo veículo) não tem piso mínimo da ANTT." };
  if (!(e.km > 0)) return { aplica: false, motivo: "Informe a distância da viagem em km." };
  const v = versaoVigente(e.data);
  const coef = v.tabelas[e.tabela][e.tipoCarga][e.eixos];
  if (!coef) return { aplica: false, motivo: "A ANTT não prevê esse tipo de carga para esse número de eixos nesta tabela." };
  const [ccd, cc] = coef;
  const valorDeslocamento = r2(ccd * e.km);
  const kmRet = e.retornoVazio ? (e.kmRetorno ?? e.km) : 0;
  const valorRetorno = r2(FATOR_RETORNO_VAZIO * ccd * kmRet);
  const piso = r2(valorDeslocamento + cc + valorRetorno);
  const fc = e.freteCombinado != null && e.freteCombinado > 0 ? e.freteCombinado : null;
  return {
    aplica: true, resolucao: v.resolucao, ccd, cc, valorDeslocamento, valorRetorno, piso,
    freteCombinado: fc, diferenca: fc == null ? null : r2(fc - piso), dentroDoPiso: fc == null ? null : fc >= piso,
  };
}
