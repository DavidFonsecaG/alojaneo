import { useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Tags, Search } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, ConfirmDialog } from "../components/ui/dialog";
import { Field, Checkbox } from "../components/ui/field";
import { ErrorBox, EmptyBox } from "../components/States";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  useRatePlans,
  useRoomTypes,
  useCreateRatePlan,
  useUpdateRatePlan,
  useDeleteRatePlan,
} from "../lib/setup";
import { ApiError } from "../lib/api";
import {
  formatMoney,
  formatDate,
  centsToInput,
  inputToCents,
  toDateInput,
} from "../lib/format";
import { cn } from "../lib/utils";
import type { RatePlan, RoomType } from "../types";

const ONLINE_FILTERS: { value: string; label: string; dot?: string }[] = [
  { value: "", label: "All" },
  { value: "online", label: "Online", dot: "bg-emerald-500" },
  { value: "offline", label: "Offline", dot: "bg-slate-400" },
];

// Rate-plan management. Lives under Settings (property configuration) rather
// than the operations nav, alongside Rooms & room types.
export function RatePlansSetup() {
  const ratePlans = useRatePlans();
  const roomTypes = useRoomTypes();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RatePlan | null>(null);
  const [deleting, setDeleting] = useState<RatePlan | null>(null);
  const [query, setQuery] = useState("");
  const [online, setOnline] = useState("");
  const deletePlan = useDeleteRatePlan();

  const types = roomTypes.data ?? [];
  const typeName = useMemo(() => {
    const m = new Map(types.map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [types]);
  const hasTypes = types.length > 0;

  const plans = ratePlans.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = plans.filter((rp) => {
    if (online === "online" && !rp.bookable_online) return false;
    if (online === "offline" && rp.bookable_online) return false;
    if (q && !`${rp.name} ${typeName(rp.room_type_id)}`.toLowerCase().includes(q))
      return false;
    return true;
  });
  const hasFilters = query !== "" || online !== "";

  return (
    // Full-height so the content card scrolls internally within the tab.
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Rate plans</h2>
          <p className="text-sm text-muted-foreground">
            Pricing plans per room type
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={!hasTypes}
        >
          <Plus className="h-4 w-4" />
          Add rate plan
        </Button>
      </div>

      {ratePlans.isLoading ? (
        <div className="flex flex-1 items-center justify-center rounded-3xl bg-card shadow-card">
          <CenteredSpinner label="Loading rate plans…" />
        </div>
      ) : ratePlans.isError ? (
        <ErrorBox message={(ratePlans.error as Error).message} />
      ) : !hasTypes ? (
        <EmptyBox
          icon={<Tags className="h-8 w-8 text-muted-foreground" />}
          title="Create a room type first"
          body="Rate plans price a room type. Add one on the Rooms page first."
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-card shadow-card">
          {/* Header bar — a separate container from the scrolling rows. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or room type…"
                  aria-label="Search rate plans"
                  className="h-9 w-72 pl-9 shadow-none"
                />
              </div>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {filtered.length} {filtered.length === 1 ? "plan" : "plans"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {ONLINE_FILTERS.map((f) => {
                const active = online === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setOnline(f.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "border-transparent bg-primary text-primary-foreground"
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
          </div>

          {/* Body — only this region scrolls. */}
          {filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <Tags className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">
                {hasFilters ? "No matching rate plans" : "No rate plans yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasFilters
                  ? "Try a different search or filter."
                  : "Add your first rate plan with the button above."}
              </p>
            </div>
          ) : (
            <Table containerClassName="min-h-0 flex-1">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Room type</TableHead>
                  <TableHead className="text-right">Base rate</TableHead>
                  <TableHead>Online</TableHead>
                  <TableHead>Cancellation</TableHead>
                  <TableHead>Stay</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((rp) => (
                  <TableRow key={rp.id}>
                    <TableCell className="font-medium">{rp.name}</TableCell>
                    <TableCell>{typeName(rp.room_type_id)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(rp.base_rate_cents, rp.currency)}
                    </TableCell>
                    <TableCell>
                      {rp.bookable_online ? (
                        <Badge variant="success">Online</Badge>
                      ) : (
                        <Badge variant="neutral">Offline</Badge>
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {rp.cancellation_policy?.replace(/_/g, " ") ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {rp.min_stay || rp.max_stay
                        ? `${rp.min_stay ?? 1}–${rp.max_stay ?? "∞"}`
                        : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {rp.valid_from || rp.valid_to
                        ? `${formatDate(rp.valid_from)} – ${formatDate(rp.valid_to)}`
                        : "Always"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditing(rp);
                            setFormOpen(true);
                          }}
                          aria-label="Edit rate plan"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(rp)}
                          aria-label="Delete rate plan"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {formOpen && (
        <RatePlanFormDialog
          plan={editing}
          types={types}
          onClose={() => setFormOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This cannot be undone."
        loading={deletePlan.isPending}
        onConfirm={() =>
          deleting &&
          deletePlan.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />
    </div>
  );
}

function RatePlanFormDialog({
  plan,
  types,
  onClose,
}: {
  plan: RatePlan | null;
  types: RoomType[];
  onClose: () => void;
}) {
  const isEdit = !!plan;
  const [roomTypeId, setRoomTypeId] = useState(
    plan?.room_type_id ?? types[0]?.id ?? "",
  );
  const [name, setName] = useState(plan?.name ?? "");
  const [rate, setRate] = useState(centsToInput(plan?.base_rate_cents) || "");
  const [currency, setCurrency] = useState(plan?.currency ?? "USD");
  const [cancellation, setCancellation] = useState(
    plan?.cancellation_policy ?? "",
  );
  const [minStay, setMinStay] = useState(
    plan?.min_stay != null ? String(plan.min_stay) : "",
  );
  const [maxStay, setMaxStay] = useState(
    plan?.max_stay != null ? String(plan.max_stay) : "",
  );
  const [bookableOnline, setBookableOnline] = useState(
    plan?.bookable_online ?? true,
  );
  const [validFrom, setValidFrom] = useState(toDateInput(plan?.valid_from));
  const [validTo, setValidTo] = useState(toDateInput(plan?.valid_to));
  const [error, setError] = useState<string | null>(null);

  const create = useCreateRatePlan();
  const update = useUpdateRatePlan();
  const pending = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      roomTypeId,
      name: name.trim(),
      baseRateCents: inputToCents(rate),
      currency,
      cancellationPolicy: cancellation.trim() || undefined,
      minStay: minStay === "" ? undefined : Number(minStay),
      maxStay: maxStay === "" ? undefined : Number(maxStay),
      bookableOnline,
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
    };
    const onError = (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Failed to save.");

    if (isEdit && plan) {
      update.mutate({ id: plan.id, ...payload }, { onSuccess: onClose, onError });
    } else {
      create.mutate(payload, { onSuccess: onClose, onError });
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${plan?.name}` : "Add rate plan"}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="rate-plan-form"
            disabled={pending || !name.trim() || rate === ""}
          >
            {pending && <Spinner />}
            {isEdit ? "Save changes" : "Add rate plan"}
          </Button>
        </>
      }
    >
      <form id="rate-plan-form" onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room type" htmlFor="rp-type">
            <Select
              id="rp-type"
              value={roomTypeId}
              onChange={(e) => setRoomTypeId(e.target.value)}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name" htmlFor="rp-name">
            <Input
              id="rp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Standard Rate"
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Base rate" htmlFor="rp-rate" hint="Per night">
            <Input
              id="rp-rate"
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="120.00"
              required
            />
          </Field>
          <Field label="Currency" htmlFor="rp-currency">
            <Input
              id="rp-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={3}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Cancellation" htmlFor="rp-cancel">
            <Input
              id="rp-cancel"
              value={cancellation}
              onChange={(e) => setCancellation(e.target.value)}
              placeholder="free"
            />
          </Field>
          <Field label="Min stay" htmlFor="rp-min">
            <Input
              id="rp-min"
              type="number"
              min={1}
              value={minStay}
              onChange={(e) => setMinStay(e.target.value)}
            />
          </Field>
          <Field label="Max stay" htmlFor="rp-max">
            <Input
              id="rp-max"
              type="number"
              min={1}
              value={maxStay}
              onChange={(e) => setMaxStay(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Valid from" htmlFor="rp-from">
            <Input
              id="rp-from"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </Field>
          <Field label="Valid to" htmlFor="rp-to">
            <Input
              id="rp-to"
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </Field>
        </div>

        <Checkbox
          id="rp-online"
          checked={bookableOnline}
          onChange={setBookableOnline}
          label="Bookable online (shown in the public booking engine)"
        />

        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Dialog>
  );
}
