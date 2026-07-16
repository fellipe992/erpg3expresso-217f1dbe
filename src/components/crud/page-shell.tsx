import { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";

export function PageShell({
  icon: Icon,
  title,
  subtitle,
  search,
  onSearch,
  onAdd,
  addLabel = "Novo",
  canAdd = true,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  search: string;
  onSearch: (v: string) => void;
  onAdd: () => void;
  addLabel?: string;
  canAdd?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-brand-subtle">
            <Icon className="size-5 text-brand" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-64 pl-9"
            />
          </div>
          {canAdd && (
            <Button onClick={onAdd}>
              <Plus className="mr-2 size-4" /> {addLabel}
            </Button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
