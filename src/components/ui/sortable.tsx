import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;
export type Accessors<T> = Record<string, (row: T) => string | number | null | undefined>;

/**
 * Ordenação estilo Excel: clique no cabeçalho alterna crescente ▲ / decrescente ▼.
 * A ordenação é mantida mesmo quando os filtros mudam (o estado vive fora da lista).
 */
export function useSort<T>(rows: T[], accessors: Accessors<T>, inicial?: { key: string; dir: SortDir }) {
  const [sort, setSort] = useState<SortState>(inicial ?? null);

  const toggle = (key: string) =>
    setSort((s) => (s && s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const acc = accessors[sort.key];
    if (!acc) return rows;
    const mult = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = acc(a);
      const bv = acc(b);
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
      return String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" }) * mult;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  return { sorted, sort, toggle, setSort };
}

export function SortHead({
  sortKey,
  sort,
  onToggle,
  children,
  align = "left",
  className,
}: {
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none whitespace-nowrap transition-colors hover:text-foreground",
        align === "right" && "text-right",
        align === "center" && "text-center",
        active && "text-foreground",
        className,
      )}
      onClick={() => onToggle(sortKey)}
      aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1",
          align === "right" && "flex-row-reverse",
        )}
      >
        {children}
        {active ? (
          sort!.dir === "asc" ? (
            <ArrowUp className="size-3 text-brand" />
          ) : (
            <ArrowDown className="size-3 text-brand" />
          )
        ) : (
          <ChevronsUpDown className="size-3 opacity-30" />
        )}
      </span>
    </TableHead>
  );
}
