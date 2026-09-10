import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Pencil,
  Search,
  Building2,
  Users,
  CheckCircle2,
  Sparkles,
  Wrench,
  BedDouble,
  Trash2,
  ImagePlus,
  X,
} from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
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
import { AMENITIES } from "../lib/amenities";
import {
  useRooms,
  useRoomTypes,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useCreateRoomType,
  useUpdateRoomType,
  useRoomTypePhotos,
  useAddRoomTypePhoto,
  useDeleteRoomTypePhoto,
  useUpdateHousekeeping,
  type HousekeepingStatus,
} from "../lib/setup";
import { useTimeline, useUpdateRoomStatus } from "../lib/reservations";
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
  occupied: { label: "Occupied", dot: "bg-sky-500", tile: "bg-sky-50" },
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
  { key: "occupied", label: "Occupied", dot: "bg-sky-500" },
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

  // The room whose operations panel is open.
  const [acting, setActing] = useState<{
    room: Room;
    stay: TimelineStay | undefined;
    state: TileState;
  } | null>(null);

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

  // Group the visible rooms by floor so the board reads like a property —
  // numeric floors ascending, unassigned last.
  const byFloor = useMemo(() => {
    const groups = new Map<string, typeof visible>();
    for (const item of visible) {
      const key = item.room.floor != null ? String(item.room.floor) : "—";
      const arr = groups.get(key);
      if (arr) arr.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.entries()].sort(([a], [b]) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return Number(a) - Number(b);
    });
  }, [visible]);

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Rooms"
        description="Live status, occupancy, and housekeeping at a glance."
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
          tint="bg-sky-100 text-sky-600"
          valueClass="text-sky-600"
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
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
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
        <div className="flex flex-1 items-center justify-center rounded-3xl bg-card shadow-sm">
          <CenteredSpinner label="Loading rooms…" />
        </div>
      ) : rooms.isError ? (
        <ErrorBox message={(rooms.error as Error).message} />
      ) : !hasTypes ? (
        <EmptyBox
          icon={<BedDouble className="h-8 w-8 text-muted-foreground" />}
          title="Create a room type first"
          body="Room setup lives in Settings → Rooms & room types."
        />
      ) : !rooms.data || rooms.data.length === 0 ? (
        <EmptyBox
          icon={<BedDouble className="h-8 w-8 text-muted-foreground" />}
          title="No rooms yet"
          body="Add rooms in Settings → Rooms & room types."
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No rooms match your search.
            </p>
          ) : (
            <div className="space-y-5 pb-1">
              {byFloor.map(([floor, items]) => (
                <section key={floor}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold tracking-tight">
                      {floor === "—" ? "Unassigned floor" : `Floor ${floor}`}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {items.length} room{items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                    {items.map(({ room, stay, state }) => (
                      <RoomTile
                        key={room.id}
                        room={room}
                        stay={stay}
                        state={state}
                        onOpen={() => setActing({ room, stay, state })}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {acting && (
        <RoomActionsDialog
          room={acting.room}
          stay={acting.stay}
          onClose={() => setActing(null)}
        />
      )}
    </div>
  );
}

// Operations panel for a room: current stay (with check-in/out + a link to the
// reservation) and a housekeeping-status toggle. Configuration lives in
// Settings, so there's no room editing here.
const HK_STATUSES: HousekeepingStatus[] = [
  "clean",
  "dirty",
  "in_progress",
  "inspected",
];

function RoomActionsDialog({
  room,
  stay,
  onClose,
}: {
  room: Room;
  stay: TimelineStay | undefined;
  onClose: () => void;
}) {
  const hk = useUpdateHousekeeping();
  const status = useUpdateRoomStatus(stay?.reservation_id ?? "");

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Room ${room.room_number}`}
      description={room.room_type_name}
    >
      <div className="space-y-5">
        <section className="space-y-2">
          <div className="text-sm font-medium">Today</div>
          {stay ? (
            <div className="rounded-lg border border-border p-3">
              <div className="text-sm font-medium">
                {stay.guest_first_name} {stay.guest_last_name}
              </div>
              <div className="mt-0.5 text-xs capitalize text-muted-foreground">
                {shortDate(stay.check_in)} – {shortDate(stay.check_out)} ·{" "}
                {stay.status.replace(/_/g, " ")}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link
                  to={`/reservations/${stay.reservation_id}`}
                  onClick={onClose}
                  className="text-sm font-medium text-blue-500 hover:underline"
                >
                  View reservation →
                </Link>
                {stay.status === "confirmed" && (
                  <Button
                    size="sm"
                    disabled={status.isPending}
                    onClick={() =>
                      status.mutate(
                        { roomId: stay.id, status: "checked_in" },
                        { onSuccess: onClose },
                      )
                    }
                  >
                    {status.isPending && <Spinner />}
                    Check in
                  </Button>
                )}
                {stay.status === "checked_in" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={status.isPending}
                    onClick={() =>
                      status.mutate(
                        { roomId: stay.id, status: "checked_out" },
                        { onSuccess: onClose },
                      )
                    }
                  >
                    {status.isPending && <Spinner />}
                    Check out
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No guest in this room today.
            </p>
          )}
        </section>

        <section className="space-y-2">
          <div className="text-sm font-medium">Housekeeping</div>
          <div className="flex flex-wrap gap-1.5">
            {HK_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={hk.isPending}
                onClick={() => hk.mutate({ id: room.id, status: s })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm capitalize transition-colors",
                  room.housekeeping_status === s
                    ? "border-transparent bg-neutral-900 text-white"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </section>
      </div>
    </Dialog>
  );
}

// Admin room setup — rendered on the Settings page. Rooms table (add / edit /
// delete) plus the room-types editor. The mutating endpoints behind these are
// gated to "rooms:manage" server-side.
export function RoomsSetup() {
  const rooms = useRooms();
  const roomTypes = useRoomTypes();
  const deleteRoom = useDeleteRoom();
  const [formOpen, setFormOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);

  const types = roomTypes.data ?? [];
  const hasTypes = types.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Rooms &amp; room types
          </h2>
          <p className="text-sm text-muted-foreground">
            Add rooms, set floors and types, and manage room-type details.
          </p>
        </div>
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
      </div>

      {rooms.isLoading ? (
        <CenteredSpinner label="Loading rooms…" />
      ) : rooms.isError ? (
        <ErrorBox message={(rooms.error as Error).message} />
      ) : !hasTypes ? (
        <EmptyBox
          icon={<BedDouble className="h-8 w-8 text-muted-foreground" />}
          title="Create a room type first"
          body="Open “Room types” above to add one, then add rooms."
        />
      ) : (rooms.data ?? []).length === 0 ? (
        <EmptyBox
          icon={<BedDouble className="h-8 w-8 text-muted-foreground" />}
          title="No rooms yet"
          body="Add your first room with the button above."
        />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Room</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Floor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Housekeeping</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rooms.data ?? []).map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-medium">
                    {room.room_number}
                  </TableCell>
                  <TableCell>{room.room_type_name}</TableCell>
                  <TableCell>{room.floor ?? "—"}</TableCell>
                  <TableCell className="capitalize">
                    {room.status.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {room.housekeeping_status.replace(/_/g, " ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit room"
                        onClick={() => {
                          setEditing(room);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete room"
                        onClick={() => setDeleting(room)}
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
          deleteRoom.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
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
    <div className="flex items-center justify-between rounded-3xl bg-card p-4 shadow-sm">
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
        "group flex flex-col rounded-2xl border border-transparent p-3 text-left shadow-sm ring-1 ring-border transition-shadow hover:shadow-md",
        meta.tile,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
          {room.room_type_name}
        </span>
        <span
          className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dot)}
          title={meta.label}
        />
      </div>

      <div className="mt-1.5 text-2xl font-bold tracking-tight">
        {room.room_number}
      </div>

      {/* Footer varies by state — kept to a single compact line */}
      <div className="mt-2 min-h-[2.25rem]">
        {state === "occupied" && stay ? (
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-700">
              {(stay.guest_first_name[0] ?? "") + (stay.guest_last_name[0] ?? "")}
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">
                {stay.guest_first_name} {stay.guest_last_name}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {shortDate(stay.check_in)} – {shortDate(stay.check_out)}
                {stay.status === "confirmed" && " · Arriving"}
              </div>
            </div>
          </div>
        ) : state === "dirty" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <Sparkles className="h-3.5 w-3.5" />
            Housekeeping
          </span>
        ) : state === "maintenance" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" />
            {room.status === "out_of_order" ? "Out of order" : "Maintenance"}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Ready
          </span>
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
  // Which type is being edited; "new" starts a blank one.
  const [selected, setSelected] = useState<string>(types[0]?.id ?? "new");
  const current = types.find((t) => t.id === selected) ?? null;

  return (
    <Dialog open onClose={onClose} title="Room types" className="max-w-2xl">
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {/* Pick a type to edit, or start a new one */}
          <div className="flex flex-wrap gap-1.5">
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                  selected === t.id
                    ? "border-transparent bg-neutral-900 text-white"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelected("new")}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                selected === "new"
                  ? "border-transparent bg-neutral-900 text-white"
                  : "border-dashed border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              New type
            </button>
          </div>

          <RoomTypeEditor
            key={current?.id ?? "new"}
            type={current}
            onCreated={(id) => setSelected(id)}
          />
        </div>
      )}
    </Dialog>
  );
}

function RoomTypeEditor({
  type,
  onCreated,
}: {
  type: RoomType | null;
  onCreated: (id: string) => void;
}) {
  const isEdit = !!type;
  const [name, setName] = useState(type?.name ?? "");
  const [maxOccupancy, setMaxOccupancy] = useState(
    String(type?.max_occupancy ?? 2),
  );
  const [description, setDescription] = useState(type?.description ?? "");
  const [amenities, setAmenities] = useState<Set<string>>(
    () => new Set(type?.amenities ?? []),
  );
  const [error, setError] = useState<string | null>(null);

  const create = useCreateRoomType();
  const update = useUpdateRoomType();
  const pending = create.isPending || update.isPending;

  const toggle = (key: string) =>
    setAmenities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const input = {
      name: name.trim(),
      maxOccupancy: Number(maxOccupancy) || 1,
      description: description.trim() || undefined,
      amenities: [...amenities],
    };
    const onError = () => setError("Couldn't save the room type.");
    if (isEdit && type) {
      update.mutate({ id: type.id, ...input }, { onError });
    } else {
      create.mutate(input, { onSuccess: (rt) => onCreated(rt.id), onError });
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-border p-4"
    >
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field label="Name" htmlFor="rt-name">
          <Input
            id="rt-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Double, Suite…"
          />
        </Field>
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

      <Field label="Description" htmlFor="rt-desc">
        <textarea
          id="rt-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Shown to guests on the booking engine…"
          className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <div className="space-y-2">
        <div className="text-sm font-medium">Amenities</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {AMENITIES.map((a) => (
            <Checkbox
              key={a.key}
              id={`am-${a.key}`}
              checked={amenities.has(a.key)}
              onChange={() => toggle(a.key)}
              label={a.label}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending || !name.trim()}>
          {pending && <Spinner />}
          {isEdit ? "Save changes" : "Create room type"}
        </Button>
      </div>

      {isEdit && type ? (
        <PhotosSection typeId={type.id} />
      ) : (
        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          Save the room type to add photos.
        </p>
      )}
    </form>
  );
}

function PhotosSection({ typeId }: { typeId: string }) {
  const photos = useRoomTypePhotos(typeId);
  const add = useAddRoomTypePhoto(typeId);
  const remove = useDeleteRoomTypePhoto(typeId);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image too large (max 5MB).");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () =>
      add.mutate(reader.result as string, {
        onError: () => setError("Upload failed."),
      });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Photos</div>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
          {add.isPending ? <Spinner /> : <ImagePlus className="h-3.5 w-3.5" />}
          Add photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPick}
            disabled={add.isPending}
          />
        </label>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {photos.isLoading ? (
        <Spinner />
      ) : (photos.data ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {(photos.data ?? []).map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border"
            >
              <img
                src={p.data_url}
                alt=""
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => remove.mutate(p.id)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900/70 text-white opacity-0 transition-opacity hover:bg-neutral-900 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
