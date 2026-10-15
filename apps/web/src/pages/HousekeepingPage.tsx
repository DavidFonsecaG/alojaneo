import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import { ErrorBox } from "../components/States";
import { useRooms, useUpdateHousekeeping } from "../lib/setup";
import type { HousekeepingStatus } from "../lib/setup";
import { cn } from "../lib/utils";
import type { Room } from "../types";

// The cleaning lifecycle. Order drives both the status filter chips and the
// sort (rooms needing attention float to the top).
const FLOW: HousekeepingStatus[] = ["dirty", "in_progress", "clean", "inspected"];
const ORDER: Record<string, number> = {
  dirty: 0,
  in_progress: 1,
  clean: 2,
  inspected: 3,
};

const META: Record<
  HousekeepingStatus,
  { label: string; dot: string; pill: string; value: string }
> = {
  dirty: {
    label: "Dirty",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-amber-600/10",
    value: "text-amber-600",
  },
  in_progress: {
    label: "Cleaning",
    dot: "bg-sky-500",
    pill: "bg-sky-50 text-sky-700 ring-sky-600/10",
    value: "text-sky-600",
  },
  clean: {
    label: "Clean",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    value: "text-emerald-600",
  },
  inspected: {
    label: "Inspected",
    dot: "bg-violet-500",
    pill: "bg-violet-50 text-violet-700 ring-violet-600/10",
    value: "text-violet-600",
  },
};

const metaFor = (s: string) =>
  META[(s as HousekeepingStatus)] ?? {
    label: s,
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-600 ring-slate-500/10",
    value: "text-slate-600",
  };

// The one-tap "advance" action for a room's current state.
function nextStep(
  status: string,
): { to: HousekeepingStatus; label: string } | null {
  switch (status) {
    case "dirty":
      return { to: "in_progress", label: "Start cleaning" };
    case "in_progress":
      return { to: "clean", label: "Mark clean" };
    case "clean":
      return { to: "inspected", label: "Mark inspected" };
    default:
      return null;
  }
}

export function HousekeepingPage() {
  const rooms = useRooms();
  const update = useUpdateHousekeeping();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [query, setQuery] = useState("");

  const all = rooms.data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      dirty: 0,
      in_progress: 0,
      clean: 0,
      inspected: 0,
    };
    for (const r of all) c[r.housekeeping_status] = (c[r.housekeeping_status] ?? 0) + 1;
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((r) => {
        if (filter && r.housekeeping_status !== filter) return false;
        if (q) {
          const hay = `${r.room_number} ${r.room_type_name ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          (ORDER[a.housekeeping_status] ?? 9) -
            (ORDER[b.housekeeping_status] ?? 9) ||
          a.room_number.localeCompare(b.room_number, undefined, {
            numeric: true,
          }),
      );
  }, [all, filter, query]);

  function setStatus(room: Room, to: HousekeepingStatus) {
    setPendingId(room.id);
    update.mutate(
      { id: room.id, status: to },
      { onSettled: () => setPendingId(null) },
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Housekeeping"
        description="Track and advance room cleaning across your property."
      />

      {/* Status counts */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FLOW.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter((f) => (f === s ? "" : s))}
            aria-pressed={filter === s}
            className={cn(
              "flex items-center justify-between rounded-3xl bg-card p-5 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover",
              filter === s && "ring-2 ring-primary/20",
            )}
          >
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", META[s].dot)} />
                {META[s].label}
              </div>
              <div
                className={cn(
                  "mt-1 text-2xl font-semibold tabular-nums",
                  META[s].value,
                )}
              >
                {rooms.isLoading ? "–" : (counts[s] ?? 0)}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Search + filter chips */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search room or type…"
            aria-label="Search rooms"
            className="w-72 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={filter === ""} onClick={() => setFilter("")} label="All" />
          {FLOW.map((s) => (
            <Chip
              key={s}
              active={filter === s}
              onClick={() => setFilter(s)}
              label={META[s].label}
              dot={META[s].dot}
            />
          ))}
        </div>
      </div>

      {rooms.isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center rounded-3xl bg-card shadow-card">
          <CenteredSpinner label="Loading rooms…" />
        </div>
      ) : rooms.isError ? (
        <ErrorBox message={(rooms.error as Error).message} />
      ) : rows.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-3xl bg-card text-center shadow-card">
          <Sparkles className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">
            {all.length === 0 ? "No rooms yet" : "Nothing matches"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {all.length === 0
              ? "Add rooms in Settings to manage housekeeping."
              : "Try a different search or filter."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((room) => {
            const meta = metaFor(room.housekeeping_status);
            const step = nextStep(room.housekeeping_status);
            const busy = pendingId === room.id;
            const canFlagDirty =
              room.housekeeping_status === "clean" ||
              room.housekeeping_status === "inspected";
            return (
              <div
                key={room.id}
                className="flex flex-col rounded-2xl bg-card p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xl font-bold tracking-tight">
                      {room.room_number}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {room.room_type_name ?? "—"}
                      {room.floor != null && ` · Floor ${room.floor}`}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                      meta.pill,
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  {step && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => setStatus(room, step.to)}
                    >
                      {busy && <Spinner />}
                      {step.label}
                    </Button>
                  )}
                  {room.housekeeping_status === "inspected" && (
                    <span className="mr-auto text-sm text-muted-foreground">
                      Ready for guests
                    </span>
                  )}
                  {canFlagDirty && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setStatus(room, "dirty")}
                    >
                      Flag dirty
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-transparent bg-neutral-900 text-white"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {dot && <span className={cn("h-2 w-2 rounded-full", dot)} />}
      {label}
    </button>
  );
}
