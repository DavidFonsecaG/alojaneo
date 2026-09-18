import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RotateCcw } from "lucide-react";
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
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import { useAllPayments, useRefundPayment } from "../lib/reservations";
import { useAuth } from "../lib/auth";
import { formatMoney } from "../lib/format";
import { cn } from "../lib/utils";
import type { Payment, PaymentStatus } from "../types";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
  { value: "failed", label: "Failed" },
];

const STATUS_STYLES: Record<PaymentStatus, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  refunded: "bg-slate-100 text-slate-600",
  failed: "bg-red-100 text-red-700",
};

const prettyMethod = (m: string) =>
  m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function StatusPill({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_STYLES[status],
      )}
    >
      {status}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-sm">
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

  const all = payments.data ?? [];
  const currency = all[0]?.currency ?? "USD";

  const methodOptions = useMemo(
    () => Array.from(new Set(all.map((p) => p.method))).sort(),
    [all],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((p) => {
      if (status && p.status !== status) return false;
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

  // Totals over the filtered rows.
  const collected = sumWhere(rows, "completed");
  const refunded = sumWhere(rows, "refunded");
  const net = collected - refunded;

  return (
    <div className="space-y-4">
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

      <div className="rounded-3xl bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search guest or booking ref…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-40"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-40"
          >
            <option value="">All methods</option>
            {methodOptions.map((m) => (
              <option key={m} value={m}>
                {prettyMethod(m)}
              </option>
            ))}
          </Select>
        </div>

        {payments.isLoading ? (
          <div className="py-12">
            <CenteredSpinner label="Loading payments…" />
          </div>
        ) : payments.isError ? (
          <p className="py-8 text-center text-sm text-destructive">
            {(payments.error as Error).message}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No payments match these filters.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
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
                      {p.guest_first_name} {p.guest_last_name}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {prettyMethod(p.method)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(p.amount_cents, p.currency)}
                    </TableCell>
                    <TableCell>
                      <StatusPill status={p.status} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        {p.status === "completed" &&
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
          </div>
        )}
      </div>
    </div>
  );
}

function sumWhere(rows: Payment[], status: PaymentStatus): number {
  return rows
    .filter((p) => p.status === status)
    .reduce((s, p) => s + p.amount_cents, 0);
}
