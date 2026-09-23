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
  data_competencia: string | null;
  cliente_id: string | null;
  fornecedor_id: string | null;
  viagem_id: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  fechamento_id: string | null;
  numero_documento: string | null;
  descricao: string;
  /** Regime de COMPETÊNCIA (gerencial): data do faturamento/custo, independente do vencimento. */
  competencia: string;
  /** Regime de CAIXA realizado: somente a data em que houve recebimento/pagamento. */
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
  /** Frete/pagamento do motorista (fechamento do motorista ou lançamento avulso da viagem) */
  freteMotorista: number;
  despesas: number;
  lucro: number;
  margem: number;
  /** Data de referência (saída, senão criação) */
  ref: string;
};

export type FechamentoBi = {
  id: string;
  numero: number | null;
  tipo: string;
  status: string;
  periodo_inicio: string;
  periodo_fim: string;
  cliente_id: string | null;
  motorista_id: string | null;
  valor: number;
};

export type BiDados = {
  viagens: ViagemBi[];
  /** Gerencial — lançamentos cuja COMPETÊNCIA cai no período. */
  lancamentos: LancBi[];
  /** Financeiro — lançamentos cuja data de CAIXA (pagamento/vencimento) cai no período. */
  lancamentosCaixa: LancBi[];
  /** Em aberto — tudo que ainda não foi pago e tem vencimento (aging/próximos vencimentos). */
  lancamentosAbertos: LancBi[];

  clientes: { id: string; nome: string }[];
  veiculos: { id: string; placa: string; label: string }[];
  motoristas: { id: string; nome: string }[];
  /** Fechamentos cujo período cruza o filtro (para avisar o que ainda falta fechar). */
  fechamentos: FechamentoBi[];
  /** Viagens do período que já integram um fechamento ativo de motorista. */
  viagensFechadasMotorista: string[];
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

/**
 * Data-calendário (AAAA-MM-DD) de um timestamp, no fuso da operação.
 * Cortar a string ISO usaria UTC e jogaria, por exemplo, uma viagem de
 * 31/07 às 22h para 01/08 — foi o que fazia períodos de um mês somarem o mês anterior.
 */
const FUSO = "America/Sao_Paulo";
export function diaLocal(valor: string | null | undefined): string {
  if (!valor) return "";
  // Datas puras (colunas `date`) não têm fuso: usar como estão.
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor).slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Desloca uma data AAAA-MM-DD em dias (usado só para a margem da consulta). */
const deslocarDia = (dia: string, dias: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Fonte única de dados para relatórios financeiros e BI (cacheada pelo React Query). */
export function useBiDados(de: string, ate: string) {
  return useQuery({
    queryKey: ["bi-dados", de, ate],
    enabled: !!de && !!ate,
    staleTime: 60_000,
    queryFn: async (): Promise<BiDados> => {
      // Margem de 1 dia em cada ponta na consulta (fuso UTC do banco); o corte
      // exato do período é feito depois, pela data-calendário local.
      const inicioBusca = deslocarDia(de, -1);
      const fim = `${deslocarDia(ate, 1)}T23:59:59`;

      const COLS_LANC =
        "id, tipo, valor, status, categoria, centro_custo, data_emissao, data_vencimento, data_pagamento, data_competencia, cliente_id, fornecedor_id, viagem_id, veiculo_id, motorista_id, fechamento_id, numero_documento, descricao";
      const COLS_FECH =
        "id, numero, tipo, status, periodo_inicio, periodo_fim, cliente_id, motorista_id, valor, lancamento_id";

      const [viagRes, lancRes, cliRes, veiRes, motRes] = await Promise.all([
        // COMPETÊNCIA operacional da viagem: data_saida (fallback created_at quando ainda não saiu)
        supabase
          .from("viagens")
          .select(
            "id, codigo, status, created_at, data_saida, data_chegada, data_prevista_saida, km_inicial, km_final, valor_frete, cliente_id, veiculo_id, motorista_id, origem_cidade, origem_uf, destino_cidade, destino_uf",
          )
          .or(
             `and(data_saida.gte.${inicioBusca},data_saida.lte.${fim}),and(data_saida.is.null,data_prevista_saida.gte.${inicioBusca},data_prevista_saida.lte.${fim}),and(data_saida.is.null,data_prevista_saida.is.null,created_at.gte.${inicioBusca},created_at.lte.${fim})`,
          ),
        // Superset: cobre competência (emissão) e caixa (vencimento/pagamento)
        supabase
          .from("financeiro_lancamentos")
          .select(COLS_LANC)
          .or(
            `and(data_competencia.gte.${de},data_competencia.lte.${ate}),and(data_emissao.gte.${de},data_emissao.lte.${ate}),and(data_vencimento.gte.${de},data_vencimento.lte.${ate}),and(data_pagamento.gte.${de},data_pagamento.lte.${ate})`,
          ),
        supabase.from("clientes").select("id, razao_social").order("razao_social"),
        supabase.from("veiculos").select("id, placa, modelo").order("placa"),
        supabase.from("motoristas").select("id, nome").order("nome"),
      ]);

      // Falhas de consulta não podem passar como "período vazio": os totais ficariam errados.
      for (const r of [viagRes, lancRes, cliRes, veiRes, motRes]) {
        if (r.error) throw r.error;
      }

      // Corte rigoroso pelo dia-calendário local (a consulta traz 1 dia de margem)
      const viagensRaw = ((viagRes.data ?? []) as Array<Record<string, unknown>>).filter((v) => {
         const dia = diaLocal((v.data_saida as string) ?? (v.data_prevista_saida as string) ?? (v.created_at as string));
        return !!dia && dia >= de && dia <= ate;
      });
      const viagemIds = viagensRaw.map((v) => String(v.id));

      // Lançamentos vinculados às viagens do período mas emitidos/pagos fora dele
      let extras: LancBi[] = [];
      if (viagemIds.length) {
        const chunks: string[][] = [];
        for (let i = 0; i < viagemIds.length; i += 200) chunks.push(viagemIds.slice(i, i + 200));
        const res = await Promise.all(
          chunks.map((ids) => supabase.from("financeiro_lancamentos").select(COLS_LANC).in("viagem_id", ids)),
        );
        extras = res.flatMap((r) => (r.data ?? []) as unknown as LancBi[]);
      }

      // Data de competência operacional de cada viagem (data_saida > created_at)
      const refViagem = new Map<string, string>();
      for (const raw of viagensRaw) {
         refViagem.set(String(raw.id), diaLocal((raw.data_saida as string) ?? (raw.data_prevista_saida as string) ?? (raw.created_at as string)));
      }

      // ---- Fechamentos -----------------------------------------------------
      // O fechamento é apurado depois do período (ex.: período 16–31/08 lançado em
      // 10/09). A competência gerencial dele é o PERÍODO APURADO, não a emissão.
      const fechRes = await supabase
        .from("fechamentos")
        .select(COLS_FECH)
        .neq("status", "cancelado")
        .lte("periodo_inicio", ate)
        .gte("periodo_fim", de);
      if (fechRes.error) throw fechRes.error;
      const fechPeriodo = ((fechRes.data ?? []) as unknown as Array<FechamentoBi & { lancamento_id: string | null }>).map(
        (f) => ({ ...f, valor: Number(f.valor ?? 0) }),
      );

      // Fechamentos referenciados por lançamentos já carregados (para tirá-los do
      // mês de emissão quando o período apurado é outro).
      const idsFechLanc = new Set<string>();
      for (const l of [...((lancRes.data ?? []) as unknown as LancBi[]), ...extras]) {
        if (l.fechamento_id) idsFechLanc.add(l.fechamento_id);
      }
      const idsFaltando = Array.from(idsFechLanc).filter((id) => !fechPeriodo.some((f) => f.id === id));
      let fechOutros: FechamentoBi[] = [];
      if (idsFaltando.length) {
        const r = await supabase.from("fechamentos").select(COLS_FECH).in("id", idsFaltando);
        if (r.error) throw r.error;
        fechOutros = ((r.data ?? []) as unknown as FechamentoBi[]).map((f) => ({ ...f, valor: Number(f.valor ?? 0) }));
      }
      const fechTodos = [...fechPeriodo, ...fechOutros];
      const fechRef = new Map(fechTodos.map((f) => [f.id, diaLocal(f.periodo_fim)]));

      // Lançamentos dos fechamentos cujo período cruza o filtro, mesmo emitidos fora dele
      const idsFechPeriodo = fechPeriodo.map((f) => f.id);
      if (idsFechPeriodo.length) {
        const r = await supabase.from("financeiro_lancamentos").select(COLS_LANC).in("fechamento_id", idsFechPeriodo);
        if (r.error) throw r.error;
        extras = [...extras, ...((r.data ?? []) as unknown as LancBi[])];
      }

       // O vínculo viagem → fechamento é a fonte correta para rankings. Um lançamento
       // consolidado pode resumir vários motoristas/placas e não deve ser atribuído a
       // apenas um deles.
      const viagensFaturadas = new Set<string>();
       const viagensFechadasMotorista = new Set<string>();
       const receitaFechamentoPorViagem = new Map<string, number>();
       const despesaFechamentoPorViagem = new Map<string, number>();
       if (viagemIds.length) {
         const r = await supabase
           .from("fechamento_viagens")
            .select("viagem_id, tipo, total, ativo, fechamento:fechamentos(id, status, valor, valor_viagens)")
           .in("viagem_id", viagemIds)
           .eq("ativo", true);
        if (r.error) throw r.error;
         for (const row of (r.data ?? []) as unknown as Array<{
           viagem_id: string;
           tipo: string;
           total: number;
            fechamento: { id: string; status: string; valor: number; valor_viagens: number } | null;
         }>) {
           if (row.fechamento?.status === "cancelado") continue;
           if (row.tipo === "cliente") {
             viagensFaturadas.add(row.viagem_id);
              // O item guarda o valor bruto da viagem. A receita reconhecida precisa
              // acompanhar o líquido da fatura, rateando os descontos extras entre
              // as viagens sem perder o vínculo com motorista e placa.
              const brutoFatura = Number(row.fechamento?.valor_viagens ?? 0);
              const liquidoFatura = Number(row.fechamento?.valor ?? 0);
              const totalItem = Number(row.total ?? 0);
              const totalLiquidoItem = brutoFatura > 0
                ? totalItem * (liquidoFatura / brutoFatura)
                : totalItem;
             receitaFechamentoPorViagem.set(
               row.viagem_id,
                (receitaFechamentoPorViagem.get(row.viagem_id) ?? 0) + totalLiquidoItem,
             );
           } else if (row.tipo === "motorista") {
             viagensFechadasMotorista.add(row.viagem_id);
             despesaFechamentoPorViagem.set(
               row.viagem_id,
               (despesaFechamentoPorViagem.get(row.viagem_id) ?? 0) + Number(row.total ?? 0),
             );
           }
         }
      }

      const mapLanc = new Map<string, LancBi>();
      for (const l of [...((lancRes.data ?? []) as unknown as LancBi[]), ...extras]) {
        const viagemRef = l.viagem_id ? refViagem.get(l.viagem_id) : undefined;
        const fechamentoRef = l.fechamento_id ? fechRef.get(l.fechamento_id) : undefined;
          // Competência = período em que a operação ocorreu. A quinzena informada
          // manualmente manda; depois a viagem; depois o período apurado do fechamento;
          // por último a emissão. Vencimento e pagamento nunca entram aqui (isso é caixa).
        const competencia =
           l.data_competencia ??
           viagemRef ??
           fechamentoRef ??
          l.data_emissao ??
          "";
         const dataCaixa = l.status === "pago" ? (l.data_pagamento ?? "") : "";
        mapLanc.set(l.id, {
          ...l,
          valor: Number(l.valor),
          competencia: diaLocal(competencia),
          dataCaixa: diaLocal(dataCaixa),
        });
      }
      const todosLanc = Array.from(mapLanc.values()).filter((l) => {
        if (l.status === "cancelado") return false;
        // Um frete avulso do motorista deixa de representar obrigação/caixa quando
        // a viagem já integra uma fatura ativa. O fechamento consolidado é a fonte única.
        if (
          l.tipo === "pagar" &&
          l.viagem_id &&
          !l.fechamento_id &&
          viagensFechadasMotorista.has(l.viagem_id) &&
          /motorista|agregado/i.test(l.categoria ?? "")
        ) return false;
        return true;
      });
      const noPeriodo = (d: string) => !!d && d >= de && d <= ate;
      const lancamentos = todosLanc.filter((l) => noPeriodo(l.competencia));
      const lancamentosCaixa = todosLanc.filter((l) => noPeriodo(l.dataCaixa));
      // Em aberto: aging e próximos vencimentos precisam de tudo que ainda não foi pago,
      // independentemente do período do filtro (o vencimento pode ser fora dele).
      const lancamentosAbertos = todosLanc.filter((l) => l.status !== "pago" && !!l.data_vencimento);


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

      // Totais por viagem respeitam a competência do filtro. Assim, uma despesa vinculada
      // à placa/OS só afeta o resultado quando a data do custo (data_emissao) está no período.
      // Receitas de frete continuam reconhecidas na data operacional da viagem.
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
         const fechMot = despesaFechamentoPorViagem.get(id) ?? 0;
         let motAvulso = 0;
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
            else if (/motorista|agregado/i.test(l.categoria ?? "")) motAvulso += l.valor;
            else outras += l.valor;
          }
        }

        // Viagem já faturada em fechamento de cliente: a receita entra pelo valor
        // apurado do fechamento; usar o frete aqui dobraria a receita.
         const receitaFechamento = receitaFechamentoPorViagem.get(id) ?? 0;
         const receita = receitaFechamento > 0 ? receitaFechamento : receitaLanc > 0 ? receitaLanc : viagensFaturadas.has(id) ? 0 : frete;
        // Motorista já fechado: vale o valor do fechamento (avulsos foram cancelados na consolidação).
        const freteMotorista = fechMot > 0 ? fechMot : motAvulso;
        const despesas = combustivel + pedagio + manutencao + outras + freteMotorista;
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
          outrasDespesas: outras + freteMotorista,
          freteMotorista,
          despesas,
          lucro,
          margem: receita > 0 ? (lucro / receita) * 100 : 0,
           ref: diaLocal((raw.data_saida as string) ?? (raw.data_prevista_saida as string) ?? (raw.created_at as string)),
        };
      });

      return {
        viagens,
        lancamentos,
        lancamentosCaixa,
        lancamentosAbertos,

        fechamentos: fechPeriodo.map(({ lancamento_id: _l, ...f }) => f),
         viagensFechadasMotorista: Array.from(viagensFechadasMotorista),
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
