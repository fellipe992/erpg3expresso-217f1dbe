import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * Campo numérico no padrão brasileiro: o usuário digita com VÍRGULA
 * (1234,56) e o `onChange` devolve a string normalizada com ponto
 * ("1234.56"), que é o formato aceito por `Number()` e pelo banco.
 *
 * Aceita ponto digitado (teclado numérico) convertendo para vírgula.
 */
export type DecimalInputProps = Omit<
  React.ComponentPropsWithoutRef<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value: string | number | null | undefined;
  /** Recebe a string normalizada com ponto decimal, ou "" quando vazio. */
  onChange: (valor: string) => void;
  /** Casas decimais permitidas (0 = inteiro, ex.: quilometragem). */
  decimais?: number;
};

const paraTexto = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "" : String(v).replace(".", ",");

export function DecimalInput({ value, onChange, decimais = 2, ...rest }: DecimalInputProps) {
  const [texto, setTexto] = React.useState(() => paraTexto(value));
  const emitido = React.useRef(paraTexto(value));

  React.useEffect(() => {
    const externo = paraTexto(value);
    if (externo !== emitido.current) {
      setTexto(externo);
      emitido.current = externo;
    }
  }, [value]);

  const aoDigitar = (bruto: string) => {
    let limpo = bruto.replace(/\./g, ",").replace(/[^\d,-]/g, "");
    limpo = limpo.replace(/(?!^)-/g, "");
    const i = limpo.indexOf(",");
    if (i >= 0) {
      limpo = limpo.slice(0, i + 1) + limpo.slice(i + 1).replace(/,/g, "");
      limpo = decimais === 0 ? limpo.slice(0, i) : limpo.slice(0, i + 1 + decimais);
    }
    setTexto(limpo);
    emitido.current = limpo;
    const normal = limpo.replace(",", ".");
    onChange(normal === "" || normal === "-" || normal === "." ? "" : normal);
  };

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={(e) => aoDigitar(e.target.value)}
    />
  );
}
