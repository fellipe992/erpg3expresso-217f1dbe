export type DestinoExtraido = {
  destino: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  sequencia: string;
  endereco_original?: string;
  endereco_corrigido?: boolean;
  lat?: number | null;
  lng?: number | null;
};

export type AgendamentoExtraido = {
  data_viagem: string;
  viagem_cliente: string;
  placa: string;
  motorista_cpf: string;
  motorista_nome: string;
  destinos: DestinoExtraido[];
};

export type VeiculoMatch = { id: string; placa: string; modelo: string | null };
export type MotoristaMatch = { id: string; nome: string; cpf?: string | null; veiculo_id?: string | null };

/** Remove hífen/espaços e coloca em caixa alta para comparar placas Mercosul e antigas. */
export function normalizarPlaca(placa: string | null | undefined): string {
  return (placa ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Mantém apenas os 11 dígitos do CPF para comparação exata. */
export function normalizarCpf(cpf: string | null | undefined): string {
  return (cpf ?? "").replace(/\D/g, "");
}

/** Normaliza texto para comparação tolerante (caixa alta, sem acento e espaços extras). */
function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Retorna a data prevista (08:00 no fuso America/Sao_Paulo) para Hoje ou Amanhã. */
export function dataPrevistaPorOpcao(
  opcao: "hoje" | "amanha",
  agora: Date = new Date(),
): { iso: string; dataBr: string; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const ano = Number(parts.find((p) => p.type === "year")?.value ?? agora.getUTCFullYear());
  const mes = Number(parts.find((p) => p.type === "month")?.value ?? agora.getUTCMonth() + 1);
  const dia = Number(parts.find((p) => p.type === "day")?.value ?? agora.getUTCDate());

  const base = new Date(Date.UTC(ano, mes - 1, dia + (opcao === "amanha" ? 1 : 0)));
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return {
    ymd: `${y}-${m}-${d}`,
    dataBr: `${d}/${m}/${y}`,
    iso: `${y}-${m}-${d}T08:00:00-03:00`,
  };
}

/** Encontra o veículo cadastrado pela placa normalizada. */
export function casarVeiculo(placa: string, veiculos: VeiculoMatch[]): VeiculoMatch | null {
  const alvo = normalizarPlaca(placa);
  if (!alvo) return null;
  return veiculos.find((v) => normalizarPlaca(v.placa) === alvo) ?? null;
}

/** Encontra o motorista por CPF, depois pelo vínculo do veículo, depois por nome. */
export function casarMotorista(
  dados: { cpf?: string; nome?: string; veiculoId?: string | null },
  motoristas: MotoristaMatch[],
): MotoristaMatch | null {
  const cpfAlvo = normalizarCpf(dados.cpf);
  if (cpfAlvo.length === 11) {
    const porCpf = motoristas.find((m) => normalizarCpf(m.cpf) === cpfAlvo);
    if (porCpf) return porCpf;
  }
  if (dados.veiculoId) {
    const porVeiculo = motoristas.find((m) => m.veiculo_id === dados.veiculoId);
    if (porVeiculo) return porVeiculo;
  }
  const nomeAlvo = normalizarTexto(dados.nome);
  if (nomeAlvo) {
    const exato = motoristas.find((m) => normalizarTexto(m.nome) === nomeAlvo);
    if (exato) return exato;
    const partes = nomeAlvo.split(" ").filter((p) => p.length > 2);
    if (partes.length >= 2) {
      const parcial = motoristas.find((m) => {
        const nm = normalizarTexto(m.nome);
        return partes.every((p) => nm.includes(p));
      });
      if (parcial) return parcial;
    }
  }
  return null;
}

/** Indica se o endereço parece ter perdido o número (cortado na tabela do cliente). */
export function enderecoPareceCortado(endereco: string): boolean {
  const limpo = endereco.trim();
  if (!limpo) return true;
  if (limpo.endsWith(",") || limpo.endsWith("-")) return true;
  // Se não contém nenhum dígito, provavelmente cortou o número.
  return !/\d/.test(limpo);
}

/** Ordena destinos pela sequência numérica da planilha (001, 002..., 999 por último). */
export function ordenarDestinos<T extends { sequencia?: string }>(destinos: T[]): T[] {
  return [...destinos].sort((a, b) => {
    const na = Number.parseInt((a.sequencia ?? "").replace(/\D/g, ""), 10);
    const nb = Number.parseInt((b.sequencia ?? "").replace(/\D/g, ""), 10);
    const va = Number.isNaN(na) ? 9999 : na;
    const vb = Number.isNaN(nb) ? 9999 : nb;
    return va - vb;
  });
}

/** Monta o endereço formatado em caixa alta para salvar em viagem_paradas. */
export function formatarEnderecoParada(d: Pick<DestinoExtraido, "endereco" | "bairro" | "cidade" | "uf">): string {
  const partes = [d.endereco.trim(), d.bairro.trim(), [d.cidade.trim(), d.uf.trim()].filter(Boolean).join(" - ")]
    .filter(Boolean);
  return partes.join(", ").toUpperCase();
}