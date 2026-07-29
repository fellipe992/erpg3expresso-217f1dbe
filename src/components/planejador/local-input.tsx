/// <reference types="google.maps" />
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { cn } from "@/lib/utils";

type Sugestao = { texto: string };

export function LocalInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [aberto, setAberto] = useState(false);
  const tokenRef = useRef<unknown>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const buscar = (texto: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (texto.trim().length < 3) {
      setSugestoes([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        await loadGoogleMaps();
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          (await google.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: texto,
          sessionToken: tokenRef.current as google.maps.places.AutocompleteSessionToken,
          includedRegionCodes: ["br"],
          language: "pt-BR",
        });
        setSugestoes(
          suggestions
            .map((s) => ({ texto: s.placePrediction?.text?.toString() ?? "" }))
            .filter((s) => s.texto),
        );
        setAberto(true);
      } catch {
        setSugestoes([]);
      }
    }, 280);
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listId}
        onChange={(e) => {
          onChange(e.target.value);
          buscar(e.target.value);
        }}
        onFocus={() => sugestoes.length > 0 && setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 160)}
      />
      {aberto && sugestoes.length > 0 && (
        <ul
          id={listId}
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {sugestoes.map((s) => (
            <li key={s.texto}>
              <button
                type="button"
                className="w-full rounded px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.texto);
                  setAberto(false);
                  setSugestoes([]);
                  tokenRef.current = null;
                }}
              >
                {s.texto}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
