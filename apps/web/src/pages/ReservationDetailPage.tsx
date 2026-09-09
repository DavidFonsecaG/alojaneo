import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BedDouble, StickyNote } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { StatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { CenteredSpinner, Spinner } from "../components/ui/spinner";
import {
  useAddNote,
  useReservation,
  useUpdateRoomStatus,
} from "../lib/reservations";
import { formatDate, formatMoney, nights } from "../lib/format";
import type { ReservationRoom, ReservationRoomStatus } from "../types";

const ROOM_STATUSES: ReservationRoomStatus[] = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
];

export function ReservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useReservation(id);

  if (isLoading) return <CenteredSpinner label="Loading reservation…" />;

  if (isError || !data) {
    return (
      <div>
        <BackLink />
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {isError ? (error as Error).message : "Reservation not found."}
        </div>
      </div>
    );
  }

  const totalNights = data.rooms.reduce(
    (sum, r) => sum + nights(r.check_in, r.check_out),
    0,
  );

  return (
    <>
      <PageHeader
        title={`${data.guest_first_name} ${data.guest_last_name}`}
        description={`${data.booking_ref} · ${data.rooms.length} room${data.rooms.length === 1 ? "" : "s"} · ${totalNights} room-night${totalNights === 1 ? "" : "s"} · ${data.source.replace(/_/g, " ")}`}
        actions={
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Total
            </div>
            <div className="text-lg font-semibold">
              {formatMoney(data.total_amount_cents)}
            </div>
          </div>
        }
      />

      <div>
        <BackLink />

        <div className="mt-4 grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <BedDouble className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Rooms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.rooms.map((room) => (
                  <RoomRow
                    key={room.id}
                    room={room}
                    reservationId={data.id}
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <NotesCard reservationId={data.id} notes={data.notes} />
          </div>
        </div>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/reservations"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to reservations
    </Link>
  );
}

function RoomRow({
  room,
  reservationId,
}: {
  room: ReservationRoom;
  reservationId: string;
}) {
  const mutation = useUpdateRoomStatus(reservationId);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            Room {room.room_number ?? "—"}
          </span>
          <StatusBadge status={room.status} />
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">
          {formatDate(room.check_in)} → {formatDate(room.check_out)} ·{" "}
          {nights(room.check_in, room.check_out)} night
          {nights(room.check_in, room.check_out) === 1 ? "" : "s"} ·{" "}
          {formatMoney(room.rate_cents)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {mutation.isPending && <Spinner />}
        <Select
          className="w-40"
          value={room.status}
          disabled={mutation.isPending}
          onChange={(e) =>
            mutation.mutate({
              roomId: room.id,
              status: e.target.value as ReservationRoomStatus,
            })
          }
        >
          {ROOM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function NotesCard({
  reservationId,
  notes,
}: {
  reservationId: string;
  notes: { id: string; body: string; user_email: string; created_at: string }[];
}) {
  const [body, setBody] = useState("");
  const addNote = useAddNote(reservationId);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    addNote.mutate(trimmed, { onSuccess: () => setBody("") });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <StickyNote className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add a note…"
            className="flex w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="submit"
            size="sm"
            disabled={addNote.isPending || !body.trim()}
          >
            {addNote.isPending && <Spinner />}
            Add note
          </Button>
        </form>

        <div className="space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="rounded-md bg-muted/50 p-3">
                <p className="text-sm">{note.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.user_email} ·{" "}
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
