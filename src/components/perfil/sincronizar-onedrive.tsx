import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudCog, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sincronizarPastasMotoristas } from "@/lib/onedrive.functions";

/**
 * Cria no OneDrive a pasta "G3 Expresso - Agregados" e uma subpasta para cada
 * motorista ativo do sistema.
 */
export function SincronizarOneDrive() {
  const sync = useServerFn(sincronizarPastasMotoristas);
  const m = useMutation({
    mutationFn: () => sync({}),
    onSuccess: (r) =>
      toast.success("Pastas sincronizadas no OneDrive", {
        description: `${r.total} motorista(s) · ${r.criadas} pasta(s) criada(s)`,
      }),
    onError: (e) => toast.error("Falha ao sincronizar", { description: (e as Error).message }),
  });

  return (
    <Button variant="outline" onClick={() => m.mutate()} disabled={m.isPending}>
      {m.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <CloudCog className="mr-2 size-4" />}
      Sincronizar pastas no OneDrive
    </Button>
  );
}
