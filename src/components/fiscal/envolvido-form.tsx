import type { EnvolvidoFiscal } from "@/lib/fiscal-tipos";
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

export function EnvolvidoForm({
  titulo,
  valor,
  onChange,
}: {
  titulo: string;
  valor: EnvolvidoFiscal;
  onChange: (v: EnvolvidoFiscal) => void;
}) {
  const set = (patch: Partial<EnvolvidoFiscal>) => onChange({ ...valor, ...patch });
  const setEnd = (patch: Partial<EnvolvidoFiscal["endereco"]>) =>
    onChange({ ...valor, endereco: { ...valor.endereco, ...patch } });

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{titulo}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nome / razão social">
          <Input value={valor.nome} onChange={(e) => set({ nome: e.target.value })} />
        </Campo>
        <Campo label="CNPJ / CPF">
          <Input value={valor.inscricaoFederal} onChange={(e) => set({ inscricaoFederal: e.target.value })} />
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
