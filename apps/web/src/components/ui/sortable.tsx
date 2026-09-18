import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "./table";
import { cn } from "../../lib/utils";

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDir;
}

// Click-to-sort state. Clicking the active column flips direction; clicking a
// new column starts it ascending.
export function useSort(initial: SortState) {
  const [sort, setSort] = useState<SortState>(initial);
  const toggle = (key: string) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
  return { sort, toggle };
}

// Sort a copy of rows using a caller-supplied value accessor. Nulls always sort
// last, regardless of direction.
export function sortRows<T>(
  rows: T[],
  sort: SortState,
  getValue: (row: T, key: string) => string | number | null | undefined,
): T[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getValue(a, sort.key);
    const bv = getValue(b, sort.key);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

export function SortableHead({
  label,
  sortKey,
  sort,
  onToggle,
  className,
  align = "left",
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  const Icon = !active
    ? ChevronsUpDown
    : sort.dir === "asc"
      ? ChevronUp
      : ChevronDown;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            active ? "opacity-100" : "opacity-40 group-hover:opacity-70",
          )}
        />
      </button>
    </TableHead>
  );
}
