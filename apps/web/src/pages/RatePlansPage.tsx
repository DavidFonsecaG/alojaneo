import { useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";
import { PageHeader } from "../components/Layout";
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
import type { RatePlan, RoomType } from "../types";

export function RatePlansPage() {
  const ratePlans = useRatePlans();
  const roomTypes = useRoomTypes();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RatePlan | null>(null);
  const [deleting, setDeleting] = useState<RatePlan | null>(null);
  const deletePlan = useDeleteRatePlan();

  const types = roomTypes.data ?? [];
  const typeName = useMemo(() => {
    const m = new Map(types.map((t) => [t.id, t.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [types]);
  const hasTypes = types.length > 0;

  return (
    // Same shell as the Reservations/Calendar pages: header on the canvas,
    // only the content card scrolls.
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Rate plans"
        description="Pricing plans per room type"
        actions={
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
        }
      />

      {ratePlans.isLoading ? (
        <div className="flex flex-1 items-center justify-center rounded-3xl bg-card shadow-sm">
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
      ) : !ratePlans.data || ratePlans.data.length === 0 ? (
        <EmptyBox
          icon={<Tags className="h-8 w-8 text-muted-foreground" />}
          title="No rate plans yet"
          body="Add your first rate plan with the button above."
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-card shadow-sm">
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
              {ratePlans.data.map((rp) => (
                <TableRow key={rp.id}>
                  <TableCell className="font-medium">{rp.name}</TableCell>
                  <TableCell>{typeName(rp.room_type_id)}</TableCell>
                  <TableCell className="text-right">
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
                  <TableCell className="text-muted-foreground">
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
