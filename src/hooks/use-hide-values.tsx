import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Ctx = {
  hidden: boolean;
  toggle: () => void;
  mask: (value: string) => string;
};

const HideValuesContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "g3.hideValues";

export function HideValuesProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setHidden(true);
    } catch {
      /* noop */
    }
  }, []);

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const mask = useCallback(
    (value: string) => (hidden ? "R$ ••••••" : value),
    [hidden],
  );

  return (
    <HideValuesContext.Provider value={{ hidden, toggle, mask }}>
      {children}
    </HideValuesContext.Provider>
  );
}

export function useHideValues() {
  const ctx = useContext(HideValuesContext);
  if (!ctx) return { hidden: false, toggle: () => {}, mask: (v: string) => v };
  return ctx;
}

export function HideValuesToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useHideValues();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className={className}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
    >
      {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      <span className="ml-2 hidden sm:inline">{hidden ? "Mostrar" : "Ocultar"} valores</span>
    </Button>
  );
}
