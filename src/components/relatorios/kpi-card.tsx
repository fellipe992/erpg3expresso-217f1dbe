import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "brand" | "success" | "danger" | "neutral";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const color =
    tone === "danger" ? "text-destructive" : tone === "success" || tone === "brand" ? "text-brand" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        {Icon && <Icon className={cn("size-4", color)} />}
      </div>
      <div className={cn("mt-2 font-display text-lg font-bold sm:text-xl", color)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function SecaoVazia({ children = "Sem dados para os filtros aplicados." }: { children?: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
