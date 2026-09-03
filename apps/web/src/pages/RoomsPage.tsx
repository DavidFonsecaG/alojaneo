import { useMemo, useState, type FormEvent } from "react";
import {
  Plus,
  Search,
  MoreHorizontal,
  Building2,
  Users,
  CheckCircle2,
  Sparkles,
  Wrench,
  BedDouble,
  Trash2,
} from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Dialog, ConfirmDialog } from "../components/ui/dialog";
import { Field } from "../components/ui/field";
import { ErrorBox, EmptyBox } from "../components/States";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import {
  useRooms,
  useRoomTypes,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useCreateRoomType,
} from "../lib/setup";
import { useTimeline } from "../lib/reservations";
import { parseApiDate, toApiDate } from "../lib/format";
import { cn } from "../lib/utils";
import { ApiError } from "../lib/api";
import type { Room, RoomType, TimelineStay } from "../types";

const ROOM_STATUSES = ["available", "maintenance", "out_of_order"];

// ── Derived per-room state ───────────────────────────────────────────
// The rooms endpoint knows operational + housekeeping status; who's actually
// in the room today comes from the timeline (a stay overlapping today). We fold
// the two into one "tile state" that drives the colour and footer of each tile.
type TileState = "occupied" | "ready" | "dirty" | "maintenance";

const STATE_META: Record<
  TileState,
  { label: string; dot: string; tile: string }
> = {
  occupied: { label: "Occupied", dot: "bg-violet-500", tile: "bg-violet-50" },
  ready: { label: "Ready", dot: "bg-emerald-500", tile: "bg-card" },
  dirty: { label: "Dirty", dot: "bg-amber-500", tile: "bg-card" },
  maintenance: { label: "Maintenance", dot: "bg-slate-400", tile: "bg-card" },
};

function midnightToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function tileStateFor(room: Room, stay: TimelineStay | undefined): TileState {
  if (room.status !== "available") return "maintenance";
  if (stay) return "occupied";
  if (
    room.housekeeping_status === "dirty" ||
    room.housekeeping_status === "in_progress"
  )
    return "dirty";
  return "ready";
}

const shortDate = (iso: string) =>
  parseApiDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const FILTERS: { key: TileState | "all"; label: string; dot?: string }[] = [
  { key: "all", label: "All rooms" },
  { key: "ready", label: "Ready", dot: "bg-emerald-500" },
  { key: "occupied", label: "Occupied", dot: "bg-violet-500" },
  { key: "dirty", label: "Dirty", dot: "bg-amber-500" },
  { key: "maintenance", label: "Maintenance", dot: "bg-slate-400" },
];

export function RoomsPage() {
  const rooms = useRooms();
  const roomTypes = useRoomTypes();

  // Stays overlapping today → current occupant per room.
  const today = midnightToday();
  const from = toApiDate(today);
  const to = toApiDate(new Date(today.getTime() + 86_400_000));
  const timeline = useTimeline(from, to);
  const stayByRoom = useMemo(() => {
    const m = new Map<string, TimelineStay>();
    for (const s of timeline.data ?? []) {
      // Keep a checked-in stay over a merely-confirmed one for the same room.
      const prev = m.get(s.room_id);
      if (!prev || s.status === "checked_in") m.set(s.room_id, s);
    }
    return m;
  }, [timeline.data]);

  const [formOpen, setFormOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const deleteRoom = useDeleteRoom();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TileState | "all">("all");

  const types = roomTypes.data ?? [];
  const hasTypes = types.length > 0;

  // Every room, decorated with its current stay + derived tile state.
  const decorated = useMemo(() => {
    return (rooms.data ?? []).map((room) => {
      const stay = stayByRoom.get(room.id);
      return { room, stay, state: tileStateFor(room, stay) };
    });
  }, [rooms.data, stayByRoom]);

  const counts = useMemo(() => {
    const c = { total: decorated.length, occupied: 0, ready: 0, dirty: 0 };
    for (const d of decorated) {
      if (d.state === "occupied") c.occupied++;
      else if (d.state === "ready") c.ready++;
      else if (d.state === "dirty") c.dirty++;
    }
    return c;
  }, [decorated]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decorated.filter(({ room, stay, state }) => {
      if (filter !== "all" && state !== filter) return false;
      if (!q) return true;
      const guest = stay
        ? `${stay.guest_first_name} ${stay.guest_last_name}`.toLowerCase()
        : "";
      return room.room_number.toLowerCase().includes(q) || guest.includes(q);
    });
  }, [decorated, filter, query]);

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Rooms"
        description="Manage status, occupancy, and guests at a glance."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setTypesOpen(true)}>
              Room types
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={!hasTypes}
            >
              <Plus className="h-4 w-4" />
              Add room
            </Button>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total rooms"
          value={counts.total}
          icon={<Building2 className="h-5 w-5" />}
          tint="bg-muted text-foreground"
        />
        <StatCard
          label="Occupied"
          value={counts.occupied}
          icon={<Users className="h-5 w-5" />}
          tint="bg-violet-100 text-violet-600"
          valueClass="text-violet-600"
        />
        <StatCard
          label="Ready"
          value={counts.ready}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tint="bg-emerald-100 text-emerald-600"
          valueClass="text-emerald-600"
        />
        <StatCard
          label="Cleaning"
          value={counts.dirty}
          icon={<Sparkles className="h-5 w-5" />}
          tint="bg-amber-100 text-amber-600"
          valueClass="text-amber-600"
        />
      </div>

      {/* Search + status filters */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by room number or guest…"
            aria-label="Search rooms"
            className="w-72 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "border-transparent bg-neutral-900 text-white"
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

      {/* Tiles */}
      {rooms.isLoading ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl bg-card shadow-sm">
          <CenteredSpinner label="Loading rooms…" />
        </div>
      ) : rooms.isError ? (
        <ErrorBox message={(rooms.error as Error).message} />
      ) : !hasTypes ? (
        <EmptyBox
          icon={<BedDouble className="h-8 w-8 text-muted-foreground" />}
          title="Create a room type first"
          body="Rooms belong to a room type. Open “Room types” above to add one."
        />
      ) : !rooms.data || rooms.data.length === 0 ? (
        <EmptyBox
          icon={<BedDouble className="h-8 w-8 text-muted-foreground" />}
          title="No rooms yet"
          body="Add your first room with the button above."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No rooms match your search.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 pb-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map(({ room, stay, state }) => (
                <RoomTile
                  key={room.id}
                  room={room}
                  stay={stay}
                  state={state}
                  onOpen={() => {
                    setEditing(room);
                    setFormOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <RoomFormDialog
          room={editing}
          types={types}
          onClose={() => setFormOpen(false)}
          onDelete={
            editing
              ? () => {
                  const target = editing;
                  setFormOpen(false);
                  setDeleting(target);
                }
              : undefined
          }
        />
      )}

      {typesOpen && (
        <RoomTypesDialog
          types={types}
          loading={roomTypes.isLoading}
          onClose={() => setTypesOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete room ${deleting?.room_number}?`}
        description="This cannot be undone. Rooms with existing reservations cannot be deleted."
        loading={deleteRoom.isPending}
        onConfirm={() =>
          deleting &&
          deleteRoom.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
          })
        }
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tint,
  valueClass,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tint: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-sm">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            valueClass,
          )}
        >
          {String(value).padStart(2, "0")}
        </div>
      </div>
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl",
          tint,
        )}
      >
        {icon}
      </div>
    </div>
  );
}

function RoomTile({
  room,
  stay,
  state,
  onOpen,
}: {
  room: Room;
  stay: TimelineStay | undefined;
  state: TileState;
  onOpen: () => void;
}) {
  const meta = STATE_META[state];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex flex-col rounded-2xl border border-transparent p-4 text-left shadow-sm ring-1 ring-border transition-shadow hover:shadow-md",
        meta.tile,
      )}
    >
      {/* Type + status dot + menu */}
      <div className="flex items-start justify-between">
        <span className="rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-border">
          {room.room_type_name}
        </span>
        <div className="flex items-center gap-2">
          <span
            className={cn("h-2.5 w-2.5 rounded-full", meta.dot)}
            title={meta.label}
          />
          <MoreHorizontal className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      {/* Room number */}
      <div className="mt-2 text-3xl font-bold tracking-tight">
        {room.room_number}
      </div>

      {/* Footer varies by state */}
      <div className="mt-4">
        {state === "occupied" && stay ? (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
              {(stay.guest_first_name[0] ?? "") + (stay.guest_last_name[0] ?? "")}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {stay.guest_first_name} {stay.guest_last_name}
              </div>
              <div className="text-xs text-muted-foreground">
                {shortDate(stay.check_in)} – {shortDate(stay.check_out)}
                {stay.status === "confirmed" && " · Arriving"}
              </div>
            </div>
          </div>
        ) : state === "dirty" ? (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
            <Sparkles className="h-4 w-4" />
            Housekeeping
          </div>
        ) : state === "maintenance" ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-medium text-muted-foreground">
            <Wrench className="h-4 w-4" />
            {room.status === "out_of_order" ? "Out of order" : "Maintenance"}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-2 text-center text-sm text-muted-foreground">
            Ready for check-in
          </div>
        )}
      </div>
    </button>
  );
}

function RoomTypesDialog({
  types,
  loading,
  onClose,
}: {
  types: RoomType[];
  loading: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [maxOccupancy, setMaxOccupancy] = useState("2");
  const create = useCreateRoomType();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), maxOccupancy: Number(maxOccupancy) || 1 },
      {
        onSuccess: () => {
          setName("");
          setMaxOccupancy("2");
        },
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title="Room types">
      <div className="space-y-4">
        {loading ? (
          <Spinner />
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No room types yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {types.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground">
                  max {t.max_occupancy}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={onSubmit}
          className="space-y-2 border-t border-border pt-4"
        >
          <Field label="New room type" htmlFor="rt-name">
            <Input
              id="rt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Double, Suite…"
            />
          </Field>
          <div className="flex items-end gap-2">
            <div className="w-24">
              <Field label="Max occ." htmlFor="rt-occ">
                <Input
                  id="rt-occ"
                  type="number"
                  min={1}
                  value={maxOccupancy}
                  onChange={(e) => setMaxOccupancy(e.target.value)}
                />
              </Field>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || !name.trim()}
            >
              {create.isPending && <Spinner />}
              Add
            </Button>
          </div>
          {create.isError && (
            <p className="text-xs text-destructive">
              {(create.error as Error).message}
            </p>
          )}
        </form>
      </div>
    </Dialog>
  );
}

function RoomFormDialog({
  room,
  types,
  onClose,
  onDelete,
}: {
  room: Room | null;
  types: RoomType[];
  onClose: () => void;
  onDelete?: () => void;
}) {
  const isEdit = !!room;
  const [roomTypeId, setRoomTypeId] = useState(
    room?.room_type_id ?? types[0]?.id ?? "",
  );
  const [roomNumber, setRoomNumber] = useState(room?.room_number ?? "");
  const [floor, setFloor] = useState(
    room?.floor != null ? String(room.floor) : "",
  );
  const [status, setStatus] = useState(room?.status ?? "available");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateRoom();
  const update = useUpdateRoom();
  const pending = create.isPending || update.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      roomTypeId,
      roomNumber: roomNumber.trim(),
      floor: floor === "" ? undefined : Number(floor),
      status,
    };
    const onError = (err: unknown) =>
      setError(err instanceof ApiError ? err.message : "Failed to save room.");

    if (isEdit && room) {
      update.mutate({ id: room.id, ...payload }, { onSuccess: onClose, onError });
    } else {
      create.mutate(payload, { onSuccess: onClose, onError });
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit room ${room?.room_number}` : "Add room"}
      footer={
        <>
          {isEdit && onDelete && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              className="mr-auto text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="room-form"
            disabled={pending || !roomNumber.trim()}
          >
            {pending && <Spinner />}
            {isEdit ? "Save changes" : "Add room"}
          </Button>
        </>
      }
    >
      <form id="room-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Room type" htmlFor="room-type">
          <Select
            id="room-type"
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room number" htmlFor="room-number">
            <Input
              id="room-number"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="101"
              required
            />
          </Field>
          <Field label="Floor" htmlFor="room-floor">
            <Input
              id="room-floor"
              type="number"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="1"
            />
          </Field>
        </div>
        <Field label="Status" htmlFor="room-status">
          <Select
            id="room-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {ROOM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </Dialog>
  );
}
