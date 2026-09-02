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
  search?: string;
  onSearch?: (v: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  canAdd?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-3 sm:p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-subtle">
            <Icon className="size-5 text-brand" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold sm:text-2xl">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {onSearch && (
            <div className="relative min-w-0 flex-1 md:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search ?? ""}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-9 md:w-64"
              />
            </div>
          )}
          {canAdd && onAdd && (
            <Button onClick={onAdd} className="shrink-0">
              <Plus className="mr-2 size-4" />
              <span className="hidden sm:inline">{addLabel}</span>
            </Button>
          )}
        </div>
      </div>

      {children}
    </div>
  );
}
