import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { CalendarDays, Plus } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { buttonVariants } from "../components/ui/button";
import { Select } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { CenteredSpinner } from "../components/ui/spinner";
import { useReservations } from "../lib/reservations";
import { formatDate, formatMoney, nights } from "../lib/format";
import type { ReservationSummaryStatus } from "../types";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Check In" },
  { value: "checked_out", label: "Checked out" },
  { value: "cancelled", label: "Cancelled" },
];

export function ReservationsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("");
  const { data, isLoading, isError, error } = useReservations(
    status ? { status } : {},
  );

  return (
    // Mirrors the Timeline page: header on the canvas, and only the content
    // card scrolls (flex-1 + min-h-0), never the whole main area.
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Reservations"
        description="All bookings across your hotel"
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-44"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Link to="/reservations/new" className={buttonVariants()}>
              <Plus className="h-4 w-4" />
              New reservation
            </Link>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl bg-card shadow-sm">
          <CenteredSpinner label="Loading reservations…" />
        </div>
      ) : isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-card text-center shadow-sm">
          <CalendarDays className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium">No reservations found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Bookings will appear here as they come in.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-sm">
          <Table containerClassName="min-h-0 flex-1">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Nights</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/reservations/${r.id}`)}
                >
                  <TableCell>
                    <div className="font-medium">
                      {r.guest_first_name} {r.guest_last_name}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.booking_ref}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(r.check_in)}</TableCell>
                  <TableCell>{formatDate(r.check_out)}</TableCell>
                  <TableCell>
                    {r.check_in && r.check_out
                      ? nights(r.check_in, r.check_out)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status as ReservationSummaryStatus} />
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {r.source.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(r.total_amount_cents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
