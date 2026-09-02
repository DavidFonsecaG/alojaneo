import { useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, BedDouble } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Input, Select } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Dialog, ConfirmDialog } from "../components/ui/dialog";
import { Field } from "../components/ui/field";
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
  useRooms,
  useRoomTypes,
  useCreateRoom,
  useUpdateRoom,
  useDeleteRoom,
  useCreateRoomType,
} from "../lib/setup";
import { ApiError } from "../lib/api";
import type { Room, RoomType } from "../types";

const ROOM_STATUSES = ["available", "maintenance", "out_of_order"];

const HK_VARIANT: Record<string, "success" | "warning" | "info" | "neutral"> = {
  clean: "success",
  dirty: "warning",
  in_progress: "info",
  inspected: "neutral",
};

export function RoomsPage() {
  const rooms = useRooms();
  const roomTypes = useRoomTypes();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const deleteRoom = useDeleteRoom();

  const types = roomTypes.data ?? [];
  const hasTypes = types.length > 0;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(room: Room) {
    setEditing(room);
    setFormOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Rooms"
        description="Physical rooms and room types"
        actions={
          <Button onClick={openCreate} disabled={!hasTypes}>
            <Plus className="h-4 w-4" />
            Add room
          </Button>
        }
      />

      <div className="grid gap-6 p-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <RoomTypesCard types={types} loading={roomTypes.isLoading} />
        </div>

        <div className="lg:col-span-2">
          {rooms.isLoading ? (
            <CenteredSpinner label="Loading rooms…" />
          ) : rooms.isError ? (
            <ErrorBox message={(rooms.error as Error).message} />
          ) : !hasTypes ? (
            <EmptyBox
              icon={<BedDouble className="h-8 w-8 text-muted-foreground" />}
              title="Create a room type first"
              body="Rooms belong to a room type. Add one on the left to get started."
            />
          ) : !rooms.data || rooms.data.length === 0 ? (
            <EmptyBox
              icon={<BedDouble className="h-8 w-8 text-muted-foreground" />}
              title="No rooms yet"
              body="Add your first room with the button above."
            />
          ) : (
            <div className="rounded-lg border border-border bg-card">
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
                  {rooms.data.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell className="font-medium">
                        {room.room_number}
                      </TableCell>
                      <TableCell>{room.room_type_name}</TableCell>
                      <TableCell>{room.floor ?? "—"}</TableCell>
                      <TableCell className="capitalize">
                        {room.status.replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={HK_VARIANT[room.housekeeping_status] ?? "neutral"}>
                          {room.housekeeping_status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(room)}
                            aria-label="Edit room"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleting(room)}
                            aria-label="Delete room"
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
        </div>
      </div>

      {formOpen && (
        <RoomFormDialog
          room={editing}
          types={types}
          onClose={() => setFormOpen(false)}
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
    </>
  );
}

function RoomTypesCard({
  types,
  loading,
}: {
  types: RoomType[];
  loading: boolean;
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Room types</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Spinner />
        ) : types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No room types yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {types.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-medium">{t.name}</span>
                <span className="text-muted-foreground">
                  max {t.max_occupancy}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onSubmit} className="space-y-2 border-t border-border pt-4">
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
      </CardContent>
    </Card>
  );
}

function RoomFormDialog({
  room,
  types,
  onClose,
}: {
  room: Room | null;
  types: RoomType[];
  onClose: () => void;
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
