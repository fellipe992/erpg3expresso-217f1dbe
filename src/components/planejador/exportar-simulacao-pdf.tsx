import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { exportarPdf } from "@/lib/export-utils";
import { carregarMapa } from "@/components/viagem/exportar-viagem-pdf";
import { brl, resumoViagem, type CustosViagem } from "@/components/viagem/demonstrativo-viagem";

export type InfoSimulacaoPdf = {
  origem: string;
  destino: string;
  paradas: string[];
  veiculo: string;
  duracao: string;
  polyline: string;
};

export function ExportarSimulacaoPdfButton({ info, custos }: { info: InfoSimulacaoPdf; custos: CustosViagem }) {
  const [gerando, setGerando] = useState(false);

  const gerar = async () => {
    setGerando(true);
    try {
      const paradas = info.paradas.map((endereco, i) => ({
        ordem: i + 1,
        cliente: null,
        endereco,
        nf: null,
        latitude: null,
        longitude: null,
      }));
      const mapa = await carregarMapa(info.origem, info.destino, paradas, info.polyline);
      if (!mapa) toast.warning("Mapa indisponível — o PDF será gerado sem ele.");
      const r = resumoViagem(custos);
      const linhasCusto: [string, number][] = [
        ["Receita bruta (frete)", custos.receita],
        ["(-) Combustível", custos.combustivel],
        ["(-) Pedágios", custos.pedagio],
        ["(-) Comissão do motorista", custos.comissao],
        ["(-) Provisão de manutenção", custos.provisaoManutencao],
        ["(-) Provisão de pneus", custos.provisaoPneus],
        ["(-) Outros custos", custos.outros],
        ["= Custo operacional total", r.custoTotal],
        ["Lucro estimado da viagem", r.lucro],
      ];
      exportarPdf({
        nomeArquivo: `viagem-planejada-${info.origem}-${info.destino}`,
        titulo: `Viagem planejada — ${info.origem} → ${info.destino}`,
        subtitulo: "G3 Expresso · Planejador de viagens",
        orientacao: "portrait",
        kpis: [
          ["Veículo", info.veiculo],
          ["Distância", custos.km ? `${custos.km.toFixed(0)} km` : "—"],
          ["Tempo estimado", info.duracao],
          ["Margem", `${r.margem.toFixed(1)}%`],
          ["Custo por km", r.custoKm != null ? brl(r.custoKm) : "—"],
          ["Lucro por km", r.lucroKm != null ? brl(r.lucroKm) : "—"],
        ],
        imagens: mapa ? [{ titulo: "Mapa da rota", dataUrl: mapa }] : [],
        secoes: [
          {
            titulo: "Margens da viagem",
            colunas: ["Margem de lucro", "Receita por km", "Custo por km", "Lucro por km"],
            linhas: [[
              `${r.margem.toFixed(1)}%`,
              r.receitaKm != null ? brl(r.receitaKm) : "—",
              r.custoKm != null ? brl(r.custoKm) : "—",
              r.lucroKm != null ? brl(r.lucroKm) : "—",
            ]],
          },
          { titulo: "Demonstrativo financeiro", colunas: ["Item", "Valor"], linhas: linhasCusto.map(([l, v]) => [l, brl(v)]) },
          ...(paradas.length
            ? [{
                titulo: "Paradas",
                colunas: ["#", "Endereço"],
                linhas: paradas.map((p) => [p.ordem, p.endereco]),
              }]
            : []),
        ],
      });
    } catch {
      toast.error("Não foi possível gerar o PDF da viagem planejada.");
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
