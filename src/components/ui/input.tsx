import * as React from "react";

import { cn } from "@/lib/utils";

/** Campos que nunca devem virar caixa alta. */
const TIPOS_SEM_CAIXA_ALTA = new Set([
  "email",
  "password",
  "url",
  "number",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
  "color",
  "file",
  "range",
  "checkbox",
  "radio",
  "hidden",
]);

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { uppercase?: boolean }
>(({ className, type, uppercase, onChange, ...props }, ref) => {
    // Padroniza a escrita em CAIXA ALTA nos campos de texto.
    const aplicarCaixaAlta =
      uppercase ?? !TIPOS_SEM_CAIXA_ALTA.has((type ?? "text").toLowerCase());

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (aplicarCaixaAlta) {
        const maiusculo = e.target.value.toUpperCase();
        if (e.target.value !== maiusculo) {
          const pos = e.target.selectionStart;
          e.target.value = maiusculo;
          if (pos !== null && e.target.type !== "email" && e.target.type !== "number") {
            try {
              e.target.setSelectionRange(pos, pos);
            } catch {
              /* alguns tipos de input não permitem seleção */
            }
          }
        }
      }
      onChange?.(e);
    };

    return (
      <input
        type={type}
        onChange={handleChange}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
