import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getGoogleMapsConfig } from "@/lib/google-maps-loader";
import { exportarPdf } from "@/lib/export-utils";
import { brl, resumoViagem, type CustosViagem } from "@/components/viagem/demonstrativo-viagem";

export type InfoViagemPdf = {
  id: string;
  codigo: string | number | null;
  origem: string;
  destino: string;
  cliente: string;
  motorista: string;
  veiculo: string;
  saidaPrevista: string;
  chegadaPrevista: string;
};

type Parada = { ordem: number; cliente: string | null; endereco: string; nf: string | null; latitude: number | null; longitude: number | null };

const pt = (p: Parada) => (p.latitude != null && p.longitude != null ? `${p.latitude},${p.longitude}` : p.endereco);

async function carregarMapa(origem: string, destino: string, paradas: Parada[]): Promise<string | null> {
  try {
    const { key } = await getGoogleMapsConfig();
    const pontos = [origem, ...paradas.map(pt), destino].filter((s) => s && s !== "—").slice(0, 25);
    if (!pontos.length) return null;
    const q = new URLSearchParams({ size: "640x360", scale: "2", maptype: "roadmap", key: key ?? "" });
    const params = [q.toString()];
    pontos.forEach((p, i) => {
      const label = i === 0 ? "A" : i === pontos.length - 1 ? "B" : String(Math.min(i, 9));
      const cor = i === 0 ? "green" : i === pontos.length - 1 ? "red" : "orange";
      params.push(`markers=${encodeURIComponent(`color:${cor}|label:${label}|${p}`)}`);
    });
    if (pontos.length > 1) params.push(`path=${encodeURIComponent(`color:0xF15A24ff|weight:4|${pontos.join("|")}`)}`);
    const url = `https://maps.googleapis.com/maps/api/staticmap?${params.join("&")}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function ExportarViagemPdfButton({ info, custos }: { info: InfoViagemPdf; custos: CustosViagem }) {
  const [gerando, setGerando] = useState(false);

  const gerar = async () => {
    setGerando(true);
    try {
      const { data } = await supabase
        .from("viagem_paradas")
        .select("ordem, cliente, endereco, nf, latitude, longitude")
        .eq("viagem_id", info.id)
        .order("ordem");
      const paradas = (data ?? []) as Parada[];
      const mapa = await carregarMapa(info.origem, info.destino, paradas);
      if (!mapa) toast.warning("Mapa indisponível — o PDF será gerado sem ele.");
      const r = resumoViagem(custos);
      const linhasCusto: [string, number][] = [
        ["Receita bruta", custos.receita],
        ...(custos.pagamentoMotorista ? ([["(-) Pagamento ao motorista", custos.pagamentoMotorista]] as [string, number][]) : []),
        ["(-) Combustível", custos.combustivel],
        ["(-) Pedágios", custos.pedagio],
        ["(-) Comissão do motorista", custos.comissao],
        ["(-) Provisão de manutenção", custos.provisaoManutencao],
        ["(-) Provisão de pneus", custos.provisaoPneus],
        ["(-) Outros custos", custos.outros],
        ["= Custo operacional total", r.custoTotal],
        ["Lucro da viagem", r.lucro],
      ];
      exportarPdf({
        nomeArquivo: `viagem-${info.codigo ?? info.id.slice(0, 8)}-${info.origem}-${info.destino}`,
        titulo: `Viagem ${info.codigo ? `OS #${info.codigo}` : ""} — ${info.origem} → ${info.destino}`,
        subtitulo: `G3 Expresso · Cliente: ${info.cliente}`,
        orientacao: "portrait",
        kpis: [
          ["Motorista", info.motorista],
          ["Veículo", info.veiculo],
          ["Saída prevista", info.saidaPrevista],
          ["Chegada prevista", info.chegadaPrevista],
          ["Distância", custos.km ? `${custos.km.toFixed(0)} km` : "—"],
          ["Margem", `${r.margem.toFixed(1)}%`],
          ["Custo por km", r.custoKm != null ? brl(r.custoKm) : "—"],
          ["Lucro por km", r.lucroKm != null ? brl(r.lucroKm) : "—"],
        ],
        imagens: mapa ? [{ titulo: "Mapa da rota", dataUrl: mapa }] : [],
        secoes: [
          { titulo: "Demonstrativo financeiro", colunas: ["Item", "Valor"], linhas: linhasCusto.map(([l, v]) => [l, brl(v)]) },
          ...(paradas.length
            ? [{
                titulo: "Paradas",
                colunas: ["#", "Cliente", "Endereço", "NF"],
                linhas: paradas.map((p) => [p.ordem, p.cliente ?? "", p.endereco, p.nf ?? ""]),
              }]
            : []),
        ],
      });
    } catch {
      toast.error("Não foi possível gerar o PDF da viagem.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={gerar} disabled={gerando}>
      {gerando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4" />}
      Exportar viagem (PDF)
    </Button>
  );
}
