import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type LancBi = {
  id: string;
  tipo: "receber" | "pagar";
  valor: number;
  status: "pendente" | "pago" | "atrasado" | "cancelado";
  categoria: string | null;
  centro_custo: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  cliente_id: string | null;
  fornecedor_id: string | null;
  viagem_id: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  numero_documento: string | null;
  descricao: string;
  /** Regime de COMPETÊNCIA (gerencial): data em que a operação ocorreu.
   *  Receita de frete = data da viagem; despesas = data do fato (abastecimento, manutenção, pedágio…). */
  competencia: string;
  /** Regime de CAIXA (financeiro): pagamento, senão vencimento, senão emissão. */
  dataCaixa: string;
};


export type ViagemBi = {
  id: string;
  codigo: string | null;
  status: string;
  created_at: string;
  data_saida: string | null;
  data_chegada: string | null;
  km: number;
  valor_frete: number;
  cliente_id: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  cliente: string;
  veiculo: string;
  placa: string;
  motorista: string;
  origem: string;
  destino: string;
  rota: string;
  /** Receita reconhecida (lançamentos a receber da viagem; fallback = valor do frete) */
  receita: number;
  recebido: number;
  pendente: number;
  atrasado: number;
  combustivel: number;
  pedagio: number;
  manutencao: number;
  outrasDespesas: number;
  despesas: number;
  lucro: number;
  margem: number;
  /** Data de referência (saída, senão criação) */
  ref: string;
};

export type BiDados = {
  viagens: ViagemBi[];
  lancamentos: LancBi[];
  clientes: { id: string; nome: string }[];
  veiculos: { id: string; placa: string; label: string }[];
  motoristas: { id: string; nome: string }[];
  nomeCliente: (id: string | null) => string;
  nomeVeiculo: (id: string | null) => string;
  nomeMotorista: (id: string | null) => string;
};

export function categoriaDespesa(c: string | null | undefined) {
  const s = (c ?? "").toLowerCase();
  if (s.includes("combust") || s.includes("diesel") || s.includes("arla") || s.includes("gasolina")) return "Combustível";
  if (s.includes("manut") || s.includes("pneu") || s.includes("oficina")) return "Manutenção";
  if (s.includes("pedág") || s.includes("pedag")) return "Pedágio";
  return "Outros";
}

/** Fonte única de dados para relatórios financeiros e BI (cacheada pelo React Query). */
export function useBiDados(de: string, ate: string) {
  return useQuery({
    queryKey: ["bi-dados", de, ate],
    enabled: !!de && !!ate,
    staleTime: 60_000,
    queryFn: async (): Promise<BiDados> => {
      const fim = `${ate}T23:59:59`;

      const [viagRes, lancRes, cliRes, veiRes, motRes] = await Promise.all([
        supabase
          .from("viagens")
          .select(
            "id, codigo, status, created_at, data_saida, data_chegada, km_inicial, km_final, valor_frete, cliente_id, veiculo_id, motorista_id, origem_cidade, origem_uf, destino_cidade, destino_uf",
          )
          .gte("created_at", de)
          .lte("created_at", fim),
        supabase
          .from("financeiro_lancamentos")
          .select(
            "id, tipo, valor, status, categoria, centro_custo, data_emissao, data_vencimento, data_pagamento, cliente_id, fornecedor_id, viagem_id, veiculo_id, motorista_id, numero_documento, descricao",
          )
          .gte("data_emissao", de)
          .lte("data_emissao", ate),
        supabase.from("clientes").select("id, razao_social").order("razao_social"),
        supabase.from("veiculos").select("id, placa, modelo").order("placa"),
        supabase.from("motoristas").select("id, nome").order("nome"),
      ]);

      const viagensRaw = (viagRes.data ?? []) as Array<Record<string, unknown>>;
      const viagemIds = viagensRaw.map((v) => String(v.id));

      // Lançamentos vinculados às viagens do período mas emitidos fora dele
      let extras: LancBi[] = [];
      if (viagemIds.length) {
        const chunks: string[][] = [];
        for (let i = 0; i < viagemIds.length; i += 200) chunks.push(viagemIds.slice(i, i + 200));
        const res = await Promise.all(
          chunks.map((ids) =>
            supabase
              .from("financeiro_lancamentos")
              .select(
                "id, tipo, valor, status, categoria, centro_custo, data_emissao, data_vencimento, data_pagamento, cliente_id, fornecedor_id, viagem_id, veiculo_id, motorista_id, numero_documento, descricao",
              )
              .in("viagem_id", ids),
          ),
        );
        extras = res.flatMap((r) => (r.data ?? []) as unknown as LancBi[]);
      }

      const mapLanc = new Map<string, LancBi>();
      for (const l of [...((lancRes.data ?? []) as unknown as LancBi[]), ...extras]) {
        mapLanc.set(l.id, { ...l, valor: Number(l.valor) });
      }
      const lancamentos = Array.from(mapLanc.values()).filter((l) => l.status !== "cancelado");

      const clientes = ((cliRes.data ?? []) as { id: string; razao_social: string }[]).map((c) => ({
        id: c.id,
        nome: c.razao_social,
      }));
      const veiculos = ((veiRes.data ?? []) as { id: string; placa: string; modelo: string | null }[]).map((v) => ({
        id: v.id,
        placa: v.placa,
        label: `${v.placa}${v.modelo ? ` · ${v.modelo}` : ""}`,
      }));
      const motoristas = ((motRes.data ?? []) as { id: string; nome: string }[]).map((m) => ({ id: m.id, nome: m.nome }));

      const cliMap = new Map(clientes.map((c) => [c.id, c.nome]));
      const veiMap = new Map(veiculos.map((v) => [v.id, v]));
      const motMap = new Map(motoristas.map((m) => [m.id, m.nome]));

      const porViagem = new Map<string, LancBi[]>();
      for (const l of lancamentos) {
        if (!l.viagem_id) continue;
        const arr = porViagem.get(l.viagem_id) ?? [];
        arr.push(l);
        porViagem.set(l.viagem_id, arr);
      }

      const viagens: ViagemBi[] = viagensRaw.map((raw) => {
        const id = String(raw.id);
        const kmI = raw.km_inicial == null ? null : Number(raw.km_inicial);
        const kmF = raw.km_final == null ? null : Number(raw.km_final);
        const km = kmI != null && kmF != null ? Math.max(0, kmF - kmI) : 0;
        const frete = Number(raw.valor_frete ?? 0);
        const ls = porViagem.get(id) ?? [];

        let receitaLanc = 0;
        let recebido = 0;
        let pendente = 0;
        let atrasado = 0;
        let combustivel = 0;
        let pedagio = 0;
        let manutencao = 0;
        let outras = 0;

        for (const l of ls) {
          if (l.tipo === "receber") {
            receitaLanc += l.valor;
            if (l.status === "pago") recebido += l.valor;
            else if (l.status === "atrasado") atrasado += l.valor;
            else pendente += l.valor;
          } else {
            const cat = categoriaDespesa(l.categoria);
            if (cat === "Combustível") combustivel += l.valor;
            else if (cat === "Manutenção") manutencao += l.valor;
            else if (cat === "Pedágio") pedagio += l.valor;
            else outras += l.valor;
          }
        }

        const receita = receitaLanc > 0 ? receitaLanc : frete;
        const despesas = combustivel + pedagio + manutencao + outras;
        const lucro = receita - despesas;
        const vei = raw.veiculo_id ? veiMap.get(String(raw.veiculo_id)) : undefined;
        const origem = [raw.origem_cidade, raw.origem_uf].filter(Boolean).join("/") || "—";
        const destino = [raw.destino_cidade, raw.destino_uf].filter(Boolean).join("/") || "—";

        return {
          id,
          codigo: (raw.codigo as string) ?? null,
          status: String(raw.status),
          created_at: String(raw.created_at),
          data_saida: (raw.data_saida as string) ?? null,
          data_chegada: (raw.data_chegada as string) ?? null,
          km,
          valor_frete: frete,
          cliente_id: (raw.cliente_id as string) ?? null,
          veiculo_id: (raw.veiculo_id as string) ?? null,
          motorista_id: (raw.motorista_id as string) ?? null,
          cliente: raw.cliente_id ? cliMap.get(String(raw.cliente_id)) ?? "—" : "—",
          veiculo: vei?.label ?? "—",
          placa: vei?.placa ?? "—",
          motorista: raw.motorista_id ? motMap.get(String(raw.motorista_id)) ?? "—" : "—",
          origem,
          destino,
          rota: `${origem} → ${destino}`,
          receita,
          recebido,
          pendente,
          atrasado,
          combustivel,
          pedagio,
          manutencao,
          outrasDespesas: outras,
          despesas,
          lucro,
          margem: receita > 0 ? (lucro / receita) * 100 : 0,
          ref: String((raw.data_saida as string) ?? raw.created_at).slice(0, 10),
        };
      });

      return {
        viagens,
        lancamentos,
        clientes,
        veiculos,
        motoristas,
        nomeCliente: (id) => (id ? cliMap.get(id) ?? "—" : "—"),
        nomeVeiculo: (id) => (id ? veiMap.get(id)?.label ?? "—" : "—"),
        nomeMotorista: (id) => (id ? motMap.get(id) ?? "—" : "—"),
      };
    },
  });
}

/** Chave AAAA-MM de um lançamento/viagem */
export const mesDe = (d: string | null | undefined) => (d ? d.slice(0, 7) : "");

export const rotuloMes = (chave: string) => {
  if (!chave) return "—";
  const [a, m] = chave.split("-");
  return `${m}/${a}`;
};
