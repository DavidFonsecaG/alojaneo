import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CalendarDays, Plus, Search } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { buttonVariants } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { SortableHead, sortRows, useSort } from "../components/ui/sortable";
import { CenteredSpinner } from "../components/ui/spinner";
import { useReservations } from "../lib/reservations";
import { formatDate, formatMoney, nights } from "../lib/format";
import { cn } from "../lib/utils";
import type { ReservationListItem, ReservationSummaryStatus } from "../types";

// Comparable value per sort column.
function reservationValue(r: ReservationListItem, key: string) {
  switch (key) {
    case "guest":
      return `${r.guest_last_name} ${r.guest_first_name}`.toLowerCase();
    case "check_in":
      return r.check_in;
    case "check_out":
      return r.check_out;
    case "nights":
      return r.check_in && r.check_out ? nights(r.check_in, r.check_out) : null;
    case "rooms":
      return r.room_count;
    case "status":
      return r.status;
    case "source":
      return r.source;
    case "total":
      return r.total_amount_cents;
    default:
      return null;
  }
}

// Status filter chips — mirror the Rooms page, with the same dot colours as
// the StatusBadge so a chip and its rows read as the same thing.
const FILTERS: { value: string; label: string; dot?: string }[] = [
  { value: "", label: "All" },
  { value: "confirmed", label: "Confirmed", dot: "bg-blue-500" },
  { value: "checked_in", label: "Check In", dot: "bg-emerald-500" },
  { value: "checked_out", label: "Checked out", dot: "bg-slate-400" },
  { value: "cancelled", label: "Cancelled", dot: "bg-red-500" },
];

function initials(first: string, last: string) {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "–";
}

export function ReservationsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const { data, isLoading, isError, error } = useReservations(
    status ? { status } : {},
  );
  const { sort, toggle } = useSort({ key: "check_in", dir: "desc" });

  const q = query.trim().toLowerCase();
  const base = data ?? [];
  const filtered = q
    ? base.filter(
        (r) =>
          `${r.guest_first_name} ${r.guest_last_name}`
            .toLowerCase()
            .includes(q) || (r.booking_ref ?? "").toLowerCase().includes(q),
      )
    : base;
  const rows = sortRows(filtered, sort, reservationValue);
  const hasFilters = status !== "" || q !== "";

  return (
    // Mirrors the Timeline page: header on the canvas, and only the content
    // card scrolls (flex-1 + min-h-0), never the whole main area.
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Reservations"
        description="All bookings across your hotel"
        actions={
          <Link to="/reservations/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" />
            New reservation
          </Link>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-card shadow-card">
        {/* Header bar — a separate container from the scrolling body (like the
            Calendar card) so the scrollbar lives only in the rows below. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search guest or booking ref…"
                aria-label="Search reservations"
                className="h-9 w-72 pl-9 shadow-none"
              />
            </div>
            {!isLoading && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {rows.length} {rows.length === 1 ? "booking" : "bookings"}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => {
              const active = status === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(f.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {f.dot && <span className={cn("h-2 w-2 rounded-full", f.dot)} />}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body — only this region scrolls, so its scrollbar starts below the
            header bar, matching the Calendar card. */}
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <CenteredSpinner label="Loading reservations…" />
          </div>
        ) : isError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">
              {hasFilters ? "No matching reservations" : "No reservations yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters
                ? "Try a different search or status filter."
                : "Bookings will appear here as they come in."}
            </p>
          </div>
        ) : (
          <Table containerClassName="min-h-0 flex-1">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <SortableHead label="Guest" sortKey="guest" sort={sort} onToggle={toggle} />
                <SortableHead label="Check-in" sortKey="check_in" sort={sort} onToggle={toggle} />
                <SortableHead label="Check-out" sortKey="check_out" sort={sort} onToggle={toggle} />
                <SortableHead label="Nights" sortKey="nights" sort={sort} onToggle={toggle} />
                <SortableHead label="Rooms" sortKey="rooms" sort={sort} onToggle={toggle} />
                <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                <SortableHead label="Source" sortKey="source" sort={sort} onToggle={toggle} />
                <SortableHead label="Total" sortKey="total" sort={sort} onToggle={toggle} align="right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/reservations/${r.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(r.guest_first_name, r.guest_last_name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {r.guest_first_name} {r.guest_last_name}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {r.booking_ref}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(r.check_in)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(r.check_out)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.check_in && r.check_out
                      ? nights(r.check_in, r.check_out)
                      : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{r.room_count}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status as ReservationSummaryStatus} />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                      {r.source.replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(r.total_amount_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
