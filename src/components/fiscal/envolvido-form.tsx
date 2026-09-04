import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import type { EnvolvidoFiscal } from "@/lib/fiscal-tipos";
import { consultarCnpj } from "@/lib/cnpj.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const envolvidoVazio = (): EnvolvidoFiscal => ({
  nome: "",
  inscricaoFederal: "",
  inscricaoEstadual: "",
  telefone: "",
  email: "",
  endereco: { logradouro: "", numero: "", bairro: "", municipio: "", uf: "", cep: "" },
});

/** Separa "Rua X, 123 - Bairro" em logradouro / número / bairro. */
function partesEndereco(endereco: string | null) {
  const [ruaNumero = "", ...resto] = String(endereco ?? "").split(" - ");
  const m = ruaNumero.match(/^(.*?),\s*([\dA-Za-z/-]+)\s*$/);
  return {
    logradouro: (m?.[1] ?? ruaNumero).trim(),
    numero: (m?.[2] ?? "").trim(),
    bairro: (resto[resto.length - 1] ?? "").trim(),
  };
}

export function EnvolvidoForm({
  titulo,
  valor,
  onChange,
}: {
  titulo: string;
  valor: EnvolvidoFiscal;
  onChange: (v: EnvolvidoFiscal) => void;
}) {
  const buscarCnpj = useServerFn(consultarCnpj);
  const [buscando, setBuscando] = useState(false);
  const [ultimo, setUltimo] = useState("");

  const set = (patch: Partial<EnvolvidoFiscal>) => onChange({ ...valor, ...patch });
  const setEnd = (patch: Partial<EnvolvidoFiscal["endereco"]>) =>
    onChange({ ...valor, endereco: { ...valor.endereco, ...patch } });

  const buscar = async (documento?: string) => {
    const cnpj = String(documento ?? valor.inscricaoFederal).replace(/\D/g, "");
    if (cnpj.length !== 14 || buscando) return;
    setUltimo(cnpj);
    setBuscando(true);
    try {
      const d = await buscarCnpj({ data: { cnpj } });
      const p = partesEndereco(d.endereco);
      onChange({
        ...valor,
        nome: d.razao_social || valor.nome,
        inscricaoFederal: cnpj,
        telefone: d.telefone ?? valor.telefone,
        email: d.email ?? valor.email ?? "",
        endereco: {
          ...valor.endereco,
          logradouro: p.logradouro || valor.endereco.logradouro,
          numero: p.numero || valor.endereco.numero,
          bairro: p.bairro || valor.endereco.bairro,
          municipio: d.cidade || valor.endereco.municipio,
          uf: (d.uf ?? valor.endereco.uf).toUpperCase(),
          cep: d.cep || valor.endereco.cep,
        },
      });
      toast.success(`${titulo}: dados preenchidos pelo CNPJ`);
    } catch (e) {
      toast.error(`${titulo}: não foi possível consultar o CNPJ`, { description: (e as Error).message });
    } finally {
      setBuscando(false);
    }
  };

  const onDocumento = (bruto: string) => {
    set({ inscricaoFederal: bruto });
    const so = bruto.replace(/\D/g, "");
    if (so.length === 14 && so !== ultimo) void buscar(so);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{titulo}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nome / razão social">
          <Input value={valor.nome} onChange={(e) => set({ nome: e.target.value })} />
        </Campo>
        <Campo label="CNPJ / CPF">
          <div className="flex gap-2">
            <Input
              value={valor.inscricaoFederal}
              onChange={(e) => onDocumento(e.target.value)}
              onBlur={() => void buscar()}
              placeholder="Digite o CNPJ para buscar"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Buscar dados do CNPJ"
              disabled={buscando || valor.inscricaoFederal.replace(/\D/g, "").length !== 14}
              onClick={() => void buscar()}
            >
              {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </div>
        </Campo>
        <Campo label="Inscrição estadual">
          <Input value={valor.inscricaoEstadual ?? ""} onChange={(e) => set({ inscricaoEstadual: e.target.value })} />
        </Campo>
        <Campo label="Telefone">
          <Input value={valor.telefone} onChange={(e) => set({ telefone: e.target.value })} />
        </Campo>
        <Campo label="E-mail">
          <Input value={valor.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
        </Campo>
        <Campo label="CEP">
          <Input value={valor.endereco.cep} onChange={(e) => setEnd({ cep: e.target.value })} />
        </Campo>
        <Campo label="Logradouro">
          <Input value={valor.endereco.logradouro} onChange={(e) => setEnd({ logradouro: e.target.value })} />
        </Campo>
        <Campo label="Número">
          <Input value={valor.endereco.numero} onChange={(e) => setEnd({ numero: e.target.value })} />
        </Campo>
        <Campo label="Bairro">
          <Input value={valor.endereco.bairro} onChange={(e) => setEnd({ bairro: e.target.value })} />
        </Campo>
        <Campo label="Município">
          <Input value={valor.endereco.municipio} onChange={(e) => setEnd({ municipio: e.target.value })} />
        </Campo>
        <Campo label="UF">
          <Input
            maxLength={2}
            value={valor.endereco.uf}
            onChange={(e) => setEnd({ uf: e.target.value.toUpperCase() })}
          />
        </Campo>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
