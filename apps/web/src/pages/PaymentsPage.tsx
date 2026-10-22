import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCcw, Search } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { SortableHead, sortRows, useSort } from "../components/ui/sortable";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import { useAllPayments, useRefundPayment } from "../lib/reservations";
import { useAuth } from "../lib/auth";
import { formatMoney } from "../lib/format";
import { cn } from "../lib/utils";
import type { Payment, PaymentStatus } from "../types";

// Status filter chips + pill styling share these colours so a chip and the
// rows it selects read as the same thing.
const STATUS_META: Record<PaymentStatus, { dot: string; pill: string }> = {
  completed: {
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  },
  pending: {
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-amber-600/10",
  },
  refunded: {
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-600 ring-slate-500/10",
  },
  failed: {
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-700 ring-red-600/10",
  },
};

const STATUS_FILTERS: { value: string; label: string; dot?: string }[] = [
  { value: "", label: "All" },
  { value: "completed", label: "Completed", dot: "bg-emerald-500" },
  { value: "pending", label: "Pending", dot: "bg-amber-500" },
  { value: "refunded", label: "Refunded", dot: "bg-slate-400" },
  { value: "failed", label: "Failed", dot: "bg-red-500" },
];

function paymentValue(p: Payment, key: string) {
  switch (key) {
    case "date":
      return p.created_at;
    case "booking":
      return p.booking_ref ?? null;
    case "guest":
      return `${p.guest_last_name ?? ""} ${p.guest_first_name ?? ""}`.toLowerCase();
    case "method":
      return p.method;
    case "amount":
      return p.amount_cents;
    case "status":
      return p.status;
    default:
      return null;
  }
}

const prettyMethod = (m: string) =>
  m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function initials(first?: string | null, last?: string | null) {
  return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase() || "–";
}

function StatusPill({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
        STATUS_META[status].pill,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[status].dot)} />
      {status}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-card">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tone)}>
        {value}
      </div>
    </div>
  );
}

export function PaymentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const payments = useAllPayments();
  const refund = useRefundPayment();

  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [search, setSearch] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const { sort, toggle } = useSort({ key: "date", dir: "desc" });

  const all = payments.data ?? [];
  const currency = all[0]?.currency ?? "USD";

  const methodOptions = useMemo(
    () => Array.from(new Set(all.map((p) => p.method))).sort(),
    [all],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((p) => {
      // Refunds are their own completed rows (kind='refund'); the "Refunded"
      // chip selects them, and "Completed" means completed charges, so the two
      // chips stay disjoint.
      if (status === "refunded") {
        if (p.kind !== "refund") return false;
      } else if (status === "completed") {
        if (p.status !== "completed" || p.kind === "refund") return false;
      } else if (status && p.status !== status) {
        return false;
      }
      if (method && p.method !== method) return false;
      if (q) {
        const hay = `${p.guest_first_name ?? ""} ${p.guest_last_name ?? ""} ${
          p.booking_ref ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, status, method, search]);

  const sorted = useMemo(() => sortRows(rows, sort, paymentValue), [rows, sort]);

  // How much has been refunded against each charge (across all rows, not just
  // the filtered ones) so the refund button knows what's left to refund.
  const refundedByCharge = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of all) {
      if (p.kind === "refund" && p.status === "completed" && p.parent_payment_id) {
        m.set(p.parent_payment_id, (m.get(p.parent_payment_id) ?? 0) - p.amount_cents);
      }
    }
    return m;
  }, [all]);

  // Totals over the filtered rows. Charges are positive, refunds negative, so
  // collected sums the positives, refunded the magnitude of the negatives, and
  // net is simply everything added up.
  const completed = rows.filter((p) => p.status === "completed");
  const collected = completed
    .filter((p) => p.amount_cents > 0)
    .reduce((s, p) => s + p.amount_cents, 0);
  const refunded = completed
    .filter((p) => p.amount_cents < 0)
    .reduce((s, p) => s - p.amount_cents, 0);
  const net = collected - refunded;

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Payments"
        description="Every payment recorded across your reservations."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Collected" value={formatMoney(collected, currency)} tone="text-emerald-600" />
        <Stat label="Refunded" value={formatMoney(refunded, currency)} tone="text-slate-600" />
        <Stat label="Net" value={formatMoney(net, currency)} />
        <Stat label="Payments" value={String(rows.length)} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-card shadow-card">
        {/* Header bar — a separate container from the scrolling rows. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search guest or booking ref…"
              aria-label="Search payments"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-72 pl-9 shadow-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_FILTERS.map((f) => {
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
                        ? "border-transparent bg-neutral-900 text-white"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {f.dot && (
                      <span className={cn("h-2 w-2 rounded-full", f.dot)} />
                    )}
                    {f.label}
                  </button>
                );
              })}
            </div>
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              aria-label="Filter by method"
              className="h-9 w-40 shadow-none"
            >
              <option value="">All methods</option>
              {methodOptions.map((m) => (
                <option key={m} value={m}>
                  {prettyMethod(m)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Body — only this region scrolls. */}
        {payments.isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <CenteredSpinner label="Loading payments…" />
          </div>
        ) : payments.isError ? (
          <div className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {(payments.error as Error).message}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-medium">No payments match these filters</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different search, status or method.
            </p>
          </div>
        ) : (
          <Table containerClassName="min-h-0 flex-1">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <SortableHead label="Date" sortKey="date" sort={sort} onToggle={toggle} />
                <SortableHead label="Booking" sortKey="booking" sort={sort} onToggle={toggle} />
                <SortableHead label="Guest" sortKey="guest" sort={sort} onToggle={toggle} />
                <SortableHead label="Method" sortKey="method" sort={sort} onToggle={toggle} />
                <SortableHead label="Amount" sortKey="amount" sort={sort} onToggle={toggle} align="right" />
                <SortableHead label="Status" sortKey="status" sort={sort} onToggle={toggle} />
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/reservations/${p.reservation_id}`}
                      className="font-mono text-xs text-ring hover:underline"
                    >
                      {p.booking_ref ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/70">
                        {initials(p.guest_first_name, p.guest_last_name)}
                      </span>
                      <span className="whitespace-nowrap font-medium">
                        {p.guest_first_name} {p.guest_last_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {prettyMethod(p.method)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      p.amount_cents < 0 && "text-rose-600",
                    )}
                  >
                    {formatMoney(p.amount_cents, p.currency)}
                  </TableCell>
                  <TableCell>
                    {p.kind === "refund" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/10">
                        <RotateCcw className="h-3 w-3" />
                        Refund
                      </span>
                    ) : (
                      <StatusPill status={p.status} />
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      {p.kind !== "refund" &&
                        p.status === "completed" &&
                        (refundedByCharge.get(p.id) ?? 0) < p.amount_cents &&
                        (confirmingId === p.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              Refund?
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={refund.isPending}
                              onClick={() =>
                                refund.mutate(p.id, {
                                  onSettled: () => setConfirmingId(null),
                                })
                              }
                            >
                              {refund.isPending && <Spinner />}
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={refund.isPending}
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmingId(p.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Refund
                          </Button>
                        ))}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
