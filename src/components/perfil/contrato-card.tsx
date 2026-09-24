import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Download, Loader2, Eraser, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { consultarCnpj } from "@/lib/cnpj.functions";
import { prazoLabel } from "@/lib/prazo-pagamento";
import { CONTRATO_VERSAO, clausulas, gerarPdfContrato, type DadosContrato } from "@/lib/contrato-motorista";

type Contrato = { id: string; assinado_em: string; pdf_path: string; razao_social: string; versao: string };

export function useContratoMotorista(motoristaId: string | null | undefined) {
  return useQuery({
    queryKey: ["motorista-contrato", motoristaId],
    enabled: !!motoristaId,
    queryFn: async (): Promise<Contrato | null> => {
      const { data } = await supabase
        .from("motorista_contratos")
        .select("id, assinado_em, pdf_path, razao_social, versao")
        .eq("motorista_id", motoristaId!)
        .eq("status", "assinado")
        .order("assinado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as Contrato | null) ?? null;
    },
  });
}

export async function baixarContrato(path: string) {
  const { data, error } = await supabase.storage.from("contratos").createSignedUrl(path, 300);
  if (error || !data) return toast.error("Não foi possível abrir o contrato");
  const { baixarArquivo } = await import("@/lib/baixar-arquivo");
  await baixarArquivo(data.signedUrl, path.split("/").pop() || "contrato.pdf");
}

/** Cartão do contrato. `podeAssinar` = o próprio motorista. */
export function ContratoCard({ motoristaId, podeAssinar }: { motoristaId: string; podeAssinar: boolean }) {
  const { data: contrato, isLoading } = useContratoMotorista(motoristaId);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <FileSignature className="size-4 text-brand" /> Contrato de prestação de serviços
          </div>
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : contrato ? (
            <Badge className="bg-success text-success-foreground">Assinado</Badge>
          ) : (
            <Badge variant="outline" className="border-warning text-warning">Pendente</Badge>
          )}
        </div>
        {contrato && (
          <p className="text-xs text-muted-foreground">
            Assinado em {new Date(contrato.assinado_em).toLocaleString("pt-BR")} · {contrato.razao_social}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {contrato && (
            <Button size="sm" variant="outline" onClick={() => baixarContrato(contrato.pdf_path)}>
              <Download className="mr-1 size-4" /> Baixar PDF
            </Button>
          )}
          {podeAssinar && !contrato && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <FileSignature className="mr-1 size-4" /> Assinar contrato
            </Button>
          )}
        </div>
        {podeAssinar && <AssinarDialog open={open} onOpenChange={setOpen} motoristaId={motoristaId} />}
      </CardContent>
    </Card>
  );
}

function AssinarDialog({ open, onOpenChange, motoristaId }: { open: boolean; onOpenChange: (v: boolean) => void; motoristaId: string }) {
  const qc = useQueryClient();
  const buscar = useServerFn(consultarCnpj);
  const [cnpj, setCnpj] = useState("");
  const [razao, setRazao] = useState("");
  const [rntrc, setRntrc] = useState("");
  const [aceito, setAceito] = useState(false);
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [temAssinatura, setTemAssinatura] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const { data: mot } = useQuery({
    queryKey: ["contrato-motorista-dados", motoristaId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("motoristas")
        .select("nome, cpf, cnh, prazo_pagamento, prazo_dias, cnpj_empresa, razao_social, rntrc, veiculo:veiculos(placa)")
        .eq("id", motoristaId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (mot) {
      setCnpj((c) => c || mot.cnpj_empresa || "");
      setRazao((r) => r || mot.razao_social || "");
      setRntrc((r) => r || mot.rntrc || "");
    }
  }, [mot]);

  const dados: DadosContrato = {
    razao_social: razao.toUpperCase(),
    cnpj,
    rntrc,
    motorista_nome: mot?.nome ?? "",
    motorista_cpf: mot?.cpf ?? null,
    motorista_cnh: mot?.cnh ?? null,
    placa: (mot?.veiculo as { placa: string } | null)?.placa ?? null,
    prazo_texto: `fechamento quinzenal com pagamento em ${prazoLabel(mot?.prazo_pagamento, mot?.prazo_dias)}`,
  };

  const buscarCnpj = async () => {
    const so = cnpj.replace(/\D/g, "");
    if (so.length !== 14) return toast.error("Informe um CNPJ com 14 dígitos");
    setBuscando(true);
    try {
      const r = await buscar({ data: { cnpj: so } });
      setRazao(r.razao_social);
    } catch (e) {
      toast.error((e as Error).message || "CNPJ não encontrado");
    } finally {
      setBuscando(false);
    }
  };

  // Assinatura na tela
  useEffect(() => {
    if (etapa !== 2) return;
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b1f4d";
    let desenhando = false;
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const down = (e: PointerEvent) => { desenhando = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); };
    const move = (e: PointerEvent) => { if (!desenhando) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setTemAssinatura(true); };
    const up = () => { desenhando = false; };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointerleave", up);
    };
  }, [etapa]);

  const limpar = () => {
    const c = canvas.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setTemAssinatura(false);
  };

  const avancar = () => {
    if (cnpj.replace(/\D/g, "").length < 11) return toast.error("Informe o CNPJ (ou CPF) da empresa");
    if (!razao.trim()) return toast.error("Informe o nome da empresa");
    if (!rntrc.trim()) return toast.error("Informe o RNTRC");
    setEtapa(2);
  };

  const assinar = async () => {
    if (!aceito) return toast.error("Marque que leu e concorda com o contrato");
    if (!temAssinatura || !canvas.current) return toast.error("Faça sua assinatura no quadro");
    setSalvando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user!.id;
      const agora = new Date();
      const png = canvas.current.toDataURL("image/png");
      const pdf = await gerarPdfContrato(dados, png, agora);
      const base = `${uid}/${agora.getTime()}`;
      const assBlob = await (await fetch(png)).blob();
      const up1 = await supabase.storage.from("contratos").upload(`${base}-assinatura.png`, assBlob, { contentType: "image/png" });
      if (up1.error) throw up1.error;
      const up2 = await supabase.storage.from("contratos").upload(`${base}-contrato.pdf`, pdf, { contentType: "application/pdf" });
      if (up2.error) throw up2.error;
      await supabase.rpc("motorista_salvar_empresa", { _cnpj: cnpj, _razao: razao, _rntrc: rntrc });
      const { error } = await supabase.from("motorista_contratos").insert({
        motorista_id: motoristaId,
        user_id: uid,
        versao: CONTRATO_VERSAO,
        cnpj,
        razao_social: razao.toUpperCase(),
        rntrc,
        dados_snapshot: dados,
        assinatura_path: `${base}-assinatura.png`,
        pdf_path: `${base}-contrato.pdf`,
        assinado_em: agora.toISOString(),
        user_agent: navigator.userAgent,
      });
      if (error) throw error;
      toast.success("Contrato assinado com sucesso");
      qc.invalidateQueries({ queryKey: ["motorista-contrato", motoristaId] });
      onOpenChange(false);
      setEtapa(1);
    } catch (e) {
      toast.error((e as Error).message || "Erro ao assinar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contrato de prestação de serviços</DialogTitle>
          <DialogDescription>{etapa === 1 ? "Passo 1 de 2 — dados da sua empresa" : "Passo 2 de 2 — leia e assine"}</DialogDescription>
        </DialogHeader>

        {etapa === 1 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>CNPJ da empresa</Label>
              <div className="flex gap-2">
                <Input inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
                <Button type="button" variant="outline" onClick={buscarCnpj} disabled={buscando}>
                  {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Nome da empresa</Label>
              <Input value={razao} onChange={(e) => setRazao(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>RNTRC</Label>
              <Input inputMode="numeric" value={rntrc} onChange={(e) => setRntrc(e.target.value)} />
            </div>
            <DialogFooter><Button onClick={avancar}>Continuar</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-[40vh] space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
              <div className="text-center font-display text-sm font-bold">CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE TRANSPORTE DE CARGAS</div>
              {clausulas(dados).map((c) => (
                <div key={c.titulo}>
                  <div className="font-semibold">{c.titulo}</div>
                  {c.itens.map((t) => <p key={t} className="mt-1 text-justify">{t}</p>)}
                </div>
              ))}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={aceito} onCheckedChange={(v) => setAceito(!!v)} className="mt-0.5" />
              Li e concordo com todas as cláusulas, inclusive a tabela de frete, a condição de pagamento, os descontos e a não concorrência.
            </label>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>Assine com o dedo no quadro</Label>
                <Button size="sm" variant="ghost" onClick={limpar}><Eraser className="mr-1 size-4" /> Limpar</Button>
              </div>
              <canvas ref={canvas} className="h-40 w-full touch-none rounded-md border-2 border-dashed bg-white" />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEtapa(1)}>Voltar</Button>
              <Button onClick={assinar} disabled={salvando}>
                {salvando ? <Loader2 className="mr-1 size-4 animate-spin" /> : <CheckCircle2 className="mr-1 size-4" />} Assinar contrato
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
