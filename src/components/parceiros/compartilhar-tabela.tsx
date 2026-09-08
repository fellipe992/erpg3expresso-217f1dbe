import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Download, Image as ImageIcon, Loader2, Share2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { brl, carregarTabela, listarTipologias, precoDe, rotuloFaixa } from "@/lib/frete";
import g3Logo from "@/assets/g3-expresso-logo.png.asset.json";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Cores fixas (hex) usadas apenas na arte exportada, para o PNG sair fiel. */
const ARTE = {
  fundo: "#0b1220",
  cartao: "#ffffff",
  marca: "#f2711c",
  marcaEscura: "#c2570d",
  texto: "#111827",
  suave: "#6b7280",
  linha: "#e5e7eb",
  zebra: "#fdf5ef",
};

type Opcao = { id: string; nome: string };

export function CompartilharTabelaParceiro() {
  const [open, setOpen] = useState(false);
  const [motoristaId, setMotoristaId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [gerando, setGerando] = useState(false);
  const arteRef = useRef<HTMLDivElement>(null);
  const { data: company } = useCompany();

  const { data: motoristas = [] } = useQuery({
    queryKey: ["parceiros-motoristas-opcoes"],
    queryFn: async (): Promise<Opcao[]> => {
      const { data, error } = await supabase.from("motoristas").select("id, nome, ativo").order("nome");
      if (error) throw error;
      return (data ?? []).filter((m) => m.ativo !== false).map((m) => ({ id: m.id, nome: m.nome }));
    },
    enabled: open,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["parceiros-clientes-opcoes"],
    queryFn: async (): Promise<Opcao[]> => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, nome_fantasia, ativo")
        .order("razao_social");
      if (error) throw error;
      return (data ?? [])
        .filter((c) => c.ativo !== false)
        .map((c) => ({ id: c.id, nome: c.nome_fantasia?.trim() || c.razao_social }));
    },
    enabled: open,
  });

  const { data: tipologias = [] } = useQuery({ queryKey: ["tipologias"], queryFn: listarTipologias, enabled: open });

  const { data: tabela, isLoading } = useQuery({
    queryKey: ["frete-tabela", clienteId, "motorista"],
    queryFn: () => carregarTabela(clienteId, "motorista"),
    enabled: open && !!clienteId,
  });

  const parceiro = motoristas.find((m) => m.id === motoristaId);
  const cliente = clientes.find((c) => c.id === clienteId);

  const faixas = tabela?.faixas ?? [];
  const precos = tabela?.precos ?? [];
  // Só as tipologias que realmente têm preço nesta tabela.
  const colunas = tipologias
    .filter((t) => t.ativo)
    .filter((t) => faixas.some((f) => precoDe(precos, f.id, t.id) != null));

  const pronto = !!parceiro && !!cliente && faixas.length > 0 && colunas.length > 0;

  const gerar = async () => {
    const node = arteRef.current;
    if (!node) return null;
    return toPng(node, { pixelRatio: 2, backgroundColor: ARTE.fundo, cacheBust: true });
  };

  const nomeArquivo = () =>
    `tabela-frete-${(parceiro?.nome ?? "parceiro").replace(/\s+/g, "-").toLowerCase()}-${(cliente?.nome ?? "cliente")
      .replace(/\s+/g, "-")
      .toLowerCase()}.png`;

  const baixar = async () => {
    setGerando(true);
    try {
      const url = await gerar();
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArquivo();
      a.click();
      toast.success("Imagem gerada");
    } catch (e) {
      toast.error("Não foi possível gerar a imagem", { description: (e as Error).message });
    } finally {
      setGerando(false);
    }
  };

  const compartilhar = async () => {
    setGerando(true);
    try {
      const url = await gerar();
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], nomeArquivo(), { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({
          files: [file],
          title: `Tabela de frete — ${cliente?.nome ?? ""}`,
          text: `Tabela de frete do parceiro ${parceiro?.nome ?? ""} — ${cliente?.nome ?? ""}`,
        });
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = nomeArquivo();
        a.click();
        toast.info("Imagem baixada", { description: "Compartilhe pelo WhatsApp ou e-mail." });
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (!/abort/i.test(msg)) toast.error("Não foi possível compartilhar", { description: msg });
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ImageIcon className="mr-2 size-4" /> Compartilhar tabela
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compartilhar tabela do parceiro</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Parceiro (motorista)</Label>
            <Select value={motoristaId} onValueChange={setMotoristaId}>
              <SelectTrigger><SelectValue placeholder="Selecione o parceiro" /></SelectTrigger>
              <SelectContent>
                {motoristas.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cliente / operação</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {clienteId && isLoading && (
          <div className="grid place-items-center py-8"><Loader2 className="size-5 animate-spin text-brand" /></div>
        )}
        {clienteId && !isLoading && (!faixas.length || !colunas.length) && (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Este cliente ainda não tem valores na tabela do motorista. Cadastre em Clientes → Tabelas de frete.
          </p>
        )}

        {pronto && (
          <div className="overflow-x-auto rounded-xl border p-2">
            <ArteTabela
              ref={arteRef}
              parceiro={parceiro!.nome}
              cliente={cliente!.nome}
              empresa={company?.nome_fantasia ?? "G3 Expresso"}
              contato={[company?.telefone, company?.email].filter(Boolean).join("  ·  ")}
              faixas={faixas.map((f) => ({
                rotulo: rotuloFaixa(f),
                valores: colunas.map((t) => precoDe(precos, f.id, t.id)),
              }))}
              colunas={colunas.map((t) => t.nome)}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          <Button variant="outline" onClick={baixar} disabled={!pronto || gerando}>
            <Download className="mr-2 size-4" /> Baixar PNG
          </Button>
          <Button onClick={compartilhar} disabled={!pronto || gerando}>
            {gerando ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Share2 className="mr-2 size-4" />}
            Compartilhar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ArteProps = {
  parceiro: string;
  cliente: string;
  empresa: string;
  contato: string;
  colunas: string[];
  faixas: { rotulo: string; valores: (number | null)[] }[];
};

function ArteTabela({ ref, parceiro, cliente, empresa, contato, colunas, faixas }: ArteProps & { ref: React.Ref<HTMLDivElement> }) {
  const hoje = new Date().toLocaleDateString("pt-BR");
  return (
    <div
      ref={ref}
      style={{
        width: 900,
        background: ARTE.fundo,
        padding: 28,
        fontFamily: "Inter, system-ui, sans-serif",
        color: ARTE.texto,
      }}
    >
      <div style={{ background: ARTE.cartao, borderRadius: 20, overflow: "hidden" }}>
        {/* Cabeçalho */}
        <div
          style={{
            background: `linear-gradient(100deg, ${ARTE.marcaEscura} 0%, ${ARTE.marca} 100%)`,
            padding: "22px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <p style={{ margin: 0, color: "#ffffff", fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              TABELA DE FRETE — PARCEIRO
            </p>
            <p style={{ margin: "6px 0 0", color: "#ffffff", fontSize: 26, fontWeight: 800 }}>{cliente}</p>
          </div>
          <img src={g3Logo.url} alt={empresa} style={{ height: 52, width: "auto", objectFit: "contain" }} />
        </div>

        {/* Identificação */}
        <div style={{ display: "flex", gap: 12, padding: "18px 28px 6px" }}>
          <Bloco titulo="Parceiro" valor={parceiro} />
          <Bloco titulo="Operação / Cliente" valor={cliente} />
          <Bloco titulo="Emitido em" valor={hoje} />
        </div>

        {/* Tabela */}
        <div style={{ padding: "12px 28px 24px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: ARTE.fundo }}>
                <th style={{ ...th, textAlign: "left" }}>Raio de entrega</th>
                {colunas.map((c) => (
                  <th key={c} style={th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {faixas.map((f, i) => (
                <tr key={f.rotulo} style={{ background: i % 2 ? ARTE.zebra : "#ffffff" }}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{f.rotulo}</td>
                  {f.valores.map((v, j) => (
                    <td key={j} style={{ ...td, color: v == null ? ARTE.suave : ARTE.texto }}>
                      {v == null ? "—" : brl(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Rodapé */}
        <div
          style={{
            borderTop: `3px solid ${ARTE.marca}`,
            padding: "14px 28px",
            display: "flex",
            justifyContent: "space-between",
            fontSize: 12,
            color: ARTE.suave,
          }}
        >
          <span style={{ fontWeight: 700, color: ARTE.texto }}>{empresa}</span>
          <span>{contato || "Valores por viagem, sujeitos a confirmação."}</span>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  color: "#ffffff",
  fontSize: 12,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  padding: "10px 12px",
  textAlign: "center",
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "center",
  borderBottom: `1px solid ${ARTE.linha}`,
};

function Bloco({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div style={{ flex: 1, background: ARTE.zebra, borderRadius: 12, padding: "10px 14px" }}>
      <p style={{ margin: 0, fontSize: 11, color: ARTE.suave, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {titulo}
      </p>
      <p style={{ margin: "4px 0 0", fontSize: 15, fontWeight: 700 }}>{valor}</p>
    </div>
  );
}
