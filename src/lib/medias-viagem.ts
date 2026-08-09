import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Médias de consumo POR VIAGEM.
 *
 * Regra: km rodado = km_final - km_inicial da viagem. Litros = soma dos
 * abastecimentos atribuídos à viagem — pelo vínculo direto (viagem_id) ou,
 * na falta dele, pelos abastecimentos do mesmo veículo dentro da janela
 * operacional (data_saida → data_chegada).
 */
export type MediaViagem = {
  viagemId: string;
  codigo: string | null;
  veiculoId: string | null;
  placa: string;
  motorista: string;
  cliente: string;
  rota: string;
  data: string | null;
  km: number;
  litros: number;
  media: number;
  gastoCombustivel: number;
  custoKm: number;
};

type ViagemRow = {
  id: string;
  codigo: string | null;
  status: string;
  data_saida: string | null;
  data_chegada: string | null;
  created_at: string;
  km_inicial: number | null;
  km_final: number | null;
  veiculo_id: string | null;
  origem_cidade: string | null;
  origem_uf: string | null;
  destino_cidade: string | null;
  destino_uf: string | null;
  cliente: { razao_social: string } | null;
  motorista: { nome: string } | null;
  veiculo: { placa: string } | null;
};

type AbastRow = {
  viagem_id: string | null;
  veiculo_id: string | null;
  data: string;
  litros: number | null;
  valor_total: number | null;
};

const dia = (v: string | null | undefined) => (v ?? "").slice(0, 10);

export function calcularMediasViagem(viagens: ViagemRow[], abast: AbastRow[]): MediaViagem[] {
  return viagens
    .map((v) => {
      const km = Math.max(0, Number(v.km_final ?? 0) - Number(v.km_inicial ?? 0));
      const ini = dia(v.data_saida ?? v.created_at);
      const fim = dia(v.data_chegada) || ini;
      const ligados = abast.filter((a) => {
        if (a.viagem_id) return a.viagem_id === v.id;
        if (!v.veiculo_id || a.veiculo_id !== v.veiculo_id) return false;
        const d = dia(a.data);
        return !!ini && d >= ini && d <= fim;
      });
      const litros = ligados.reduce((s, a) => s + Number(a.litros ?? 0), 0);
      const gasto = ligados.reduce((s, a) => s + Number(a.valor_total ?? 0), 0);
      return {
        viagemId: v.id,
        codigo: v.codigo,
        veiculoId: v.veiculo_id,
        placa: v.veiculo?.placa ?? "—",
        motorista: v.motorista?.nome ?? "—",
        cliente: v.cliente?.razao_social ?? "—",
        rota: `${v.origem_cidade ?? "—"}${v.origem_uf ? "/" + v.origem_uf : ""} → ${v.destino_cidade ?? "—"}${v.destino_uf ? "/" + v.destino_uf : ""}`,
        data: v.data_saida ?? v.created_at,
        km,
        litros,
        media: litros > 0 && km > 0 ? km / litros : 0,
        gastoCombustivel: gasto,
        custoKm: km > 0 ? gasto / km : 0,
      } satisfies MediaViagem;
    })
    .sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
}

export function useMediasPorViagem(opts: { de: string; ate: string; veiculoId?: string | null; enabled?: boolean }) {
  const { de, ate, veiculoId } = opts;
  return useQuery({
    queryKey: ["medias-viagem", de, ate, veiculoId ?? "all"],
    enabled: (opts.enabled ?? true) && !!de && !!ate,
    queryFn: async (): Promise<MediaViagem[]> => {
      let viagQ = supabase
        .from("viagens")
        .select(
          "id, codigo, status, data_saida, data_chegada, created_at, km_inicial, km_final, veiculo_id, origem_cidade, origem_uf, destino_cidade, destino_uf, cliente:clientes(razao_social), motorista:motoristas(nome), veiculo:veiculos(placa)",
        )
        .or(
          `and(data_saida.gte.${de},data_saida.lte.${ate}T23:59:59),and(data_saida.is.null,created_at.gte.${de},created_at.lte.${ate}T23:59:59)`,
        );
      if (veiculoId) viagQ = viagQ.eq("veiculo_id", veiculoId);

      let abastQ = supabase
        .from("abastecimentos")
        .select("viagem_id, veiculo_id, data, litros, valor_total")
        // margem para abastecimentos que antecedem/seguem a janela da viagem
        .gte("data", de)
        .lte("data", ate);
      if (veiculoId) abastQ = abastQ.eq("veiculo_id", veiculoId);

      const [viag, abast] = await Promise.all([viagQ, abastQ]);
      if (viag.error) throw viag.error;
      if (abast.error) throw abast.error;

      const viagens = ((viag.data ?? []) as unknown as ViagemRow[]).filter(
        (v) => v.status === "concluida" && Number(v.km_final ?? 0) > Number(v.km_inicial ?? 0),
      );
      return calcularMediasViagem(viagens, (abast.data ?? []) as AbastRow[]);
    },
  });
}

/** Média da ÚLTIMA viagem concluída de cada veículo. */
export function ultimaMediaPorVeiculo(rows: MediaViagem[]) {
  const map = new Map<string, MediaViagem>();
  for (const r of rows) {
    if (!r.veiculoId || r.media <= 0) continue;
    const atual = map.get(r.veiculoId);
    if (!atual || (r.data ?? "") > (atual.data ?? "")) map.set(r.veiculoId, r);
  }
  return map;
}
