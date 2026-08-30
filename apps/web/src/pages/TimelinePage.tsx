import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/input";
import { CenteredSpinner } from "../components/ui/spinner";
import { useRooms } from "../lib/setup";
import { useTimeline } from "../lib/reservations";
import { parseApiDate, toApiDate } from "../lib/format";
import { cn } from "../lib/utils";
import type { Room, TimelineStay } from "../types";

// ── Geometry ─────────────────────────────────────────────────────────
// The day-column width is computed at runtime so the selected range fills
// the card's width: every column shares one `dayW`, which keeps the lanes,
// the date header and the reservation bars aligned. It only falls back to a
// minimum (and horizontal scroll) when the range can't fit the screen.
const LEFT_W = 184; // frozen room column
const MIN_DAY_W = 52; // below this we scroll instead of shrinking (keeps the date on one line)
const DEFAULT_DAY_W = 112; // used for the first paint, before the card is measured
const ROW_H = 44; // one room lane
const DAY_MS = 86_400_000;

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Bar colour per stay status. Cancelled / no-show never reach the client —
// the timeline endpoint filters them out (the room is released).
const BAR: Record<string, string> = {
  confirmed: "bg-blue-500 hover:bg-blue-600",
  checked_in: "bg-emerald-500 hover:bg-emerald-600",
  checked_out: "bg-slate-400 hover:bg-slate-500",
};

// Room operational status → the dot next to the room number.
const ROOM_DOT: Record<string, string> = {
  available: "bg-emerald-500",
  maintenance: "bg-amber-500",
  out_of_order: "bg-red-500",
};

const WINDOWS = [7, 14, 30];

interface RoomGroup {
  typeId: string;
  typeName: string;
  rooms: Room[];
}

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Cheap vertical day gridlines: one right border per column, drawn as a
// repeating background so an empty lane costs zero extra DOM.
const gridBg = (dayW: number) =>
  `repeating-linear-gradient(to right, transparent 0, transparent ${
    dayW - 1
  }px, hsl(var(--border)) ${dayW - 1}px, hsl(var(--border)) ${dayW}px)`;

// Weekend + today column tints. Only the special columns get a div; plain
// weekdays render nothing.
function ColumnTints({
  days,
  today,
  dayW,
}: {
  days: Date[];
  today: Date;
  dayW: number;
}) {
  return (
    <>
      {days.map((d, i) => {
        const isToday = d.getTime() === today.getTime();
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        if (!weekend && !isToday) return null;
        return (
          <div
            key={i}
            className={cn(
              "absolute inset-y-0",
              isToday ? "bg-primary/10" : "bg-muted/40",
            )}
            style={{ left: i * dayW, width: dayW }}
          />
        );
      })}
    </>
  );
}

export function TimelinePage() {
  const navigate = useNavigate();
  const today = midnight(new Date());
  // Open a few days before today so recent check-outs are visible on load,
  // rather than sitting off the left edge.
  const LEAD_DAYS = 3;
  const defaultStart = midnight(new Date(today.getTime() - LEAD_DAYS * DAY_MS));

  const [windowDays, setWindowDays] = useState(14);
  const [start, setStart] = useState<Date>(defaultStart);

  // Measure the scroll card so the day columns can stretch to fill its width.
  // A callback ref (re-runs when the card mounts after loading) plus a
  // ResizeObserver keeps `containerW` in sync with layout and scrollbar changes.
  const [containerW, setContainerW] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    roRef.current = new ResizeObserver(update);
    roRef.current.observe(el);
  }, []);

  const days = useMemo(
    () =>
      Array.from({ length: windowDays }, (_, i) =>
        midnight(new Date(start.getTime() + i * DAY_MS)),
      ),
    [start, windowDays],
  );

  const from = toApiDate(start);
  const to = toApiDate(new Date(start.getTime() + windowDays * DAY_MS));

  const rooms = useRooms();
  const timeline = useTimeline(from, to);

  // Rooms grouped by type, groups ordered by type name, rooms by number
  // (the API already returns them number-ordered).
  const groups = useMemo<RoomGroup[]>(() => {
    const byType = new Map<string, RoomGroup>();
    for (const r of rooms.data ?? []) {
      const key = r.room_type_id;
      let g = byType.get(key);
      if (!g) {
        g = { typeId: key, typeName: r.room_type_name ?? "Rooms", rooms: [] };
        byType.set(key, g);
      }
      g.rooms.push(r);
    }
    return [...byType.values()].sort((a, b) =>
      a.typeName.localeCompare(b.typeName),
    );
  }, [rooms.data]);

  // Stays bucketed by room for O(1) lane lookup.
  const staysByRoom = useMemo(() => {
    const m = new Map<string, TimelineStay[]>();
    for (const s of timeline.data ?? []) {
      const list = m.get(s.room_id);
      if (list) list.push(s);
      else m.set(s.room_id, [s]);
    }
    return m;
  }, [timeline.data]);

  const rangeEnd = new Date(start.getTime() + windowDays * DAY_MS);
  const rangeLabel = `${start.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${new Date(rangeEnd.getTime() - DAY_MS).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  // Stretch each day column to fill the card; only fall back to the minimum
  // (which then scrolls horizontally) when the range can't fit the width.
  const dayW =
    containerW > 0
      ? Math.max(MIN_DAY_W, (containerW - LEFT_W) / windowDays)
      : DEFAULT_DAY_W;
  const bodyWidth = LEFT_W + windowDays * dayW;

  function shift(dir: -1 | 1) {
    setStart((s) => midnight(new Date(s.getTime() + dir * windowDays * DAY_MS)));
  }

  const loading = rooms.isLoading || timeline.isLoading;
  const noRooms = !rooms.isLoading && (rooms.data ?? []).length === 0;

  return (
    <div className="flex h-screen flex-col">
      <PageHeader
        title="Timeline"
        description="Rooms down the side, stays across the days"
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="w-28"
              aria-label="Days shown"
            >
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w} days
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => shift(-1)}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-44 text-center text-sm font-medium">
              {rangeLabel}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => shift(1)}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setStart(defaultStart)}
            >
              Today
            </Button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col p-8">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <CenteredSpinner label="Loading timeline…" />
          </div>
        ) : noRooms ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No rooms yet. Add rooms on the{" "}
              <button
                className="font-medium text-primary hover:underline"
                onClick={() => navigate("/rooms")}
              >
                Rooms
              </button>{" "}
              page to see them here.
            </div>
          </div>
        ) : (
          <>
            <div
              ref={measureRef}
              className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card"
            >
              <div className="flex min-h-full flex-col" style={{ width: bodyWidth }}>
                {/* Date header */}
                <div className="sticky top-0 z-20 flex border-b border-border bg-card">
                  <div
                    className="sticky left-0 z-30 shrink-0 border-r border-border bg-card"
                    style={{ width: LEFT_W }}
                  />
                  {days.map((d) => {
                    const isToday = d.getTime() === today.getTime();
                    const weekend = d.getDay() === 0 || d.getDay() === 6;
                    return (
                      <div
                        key={d.toISOString()}
                        className={cn(
                          "shrink-0 whitespace-nowrap border-r border-border px-1 py-2 text-center text-xs leading-tight",
                          weekend && "bg-muted/40",
                          isToday && "bg-primary/10",
                        )}
                        style={{ width: dayW }}
                      >
                        <div className="text-muted-foreground">
                          {WEEKDAY[d.getDay()]}
                        </div>
                        <div
                          className={cn(
                            "font-semibold",
                            isToday && "text-primary",
                          )}
                        >
                          {d.toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Groups + lanes */}
                {groups.map((group) => (
                  <div key={group.typeId}>
                    {/* Group header */}
                    <div className="flex border-b border-border">
                      <div
                        className="sticky left-0 z-10 shrink-0 border-r border-border bg-muted/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        style={{ width: LEFT_W }}
                      >
                        {group.typeName}
                      </div>
                      <div
                        className="bg-muted/25"
                        style={{ width: windowDays * dayW }}
                      />
                    </div>

                    {group.rooms.map((room) => (
                      <div
                        key={room.id}
                        className="flex border-b border-border last:border-b-0"
                        style={{ height: ROW_H }}
                      >
                        {/* Frozen room cell */}
                        <div
                          className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-border bg-card px-3"
                          style={{ width: LEFT_W }}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 shrink-0 rounded-full",
                              ROOM_DOT[room.status] ?? "bg-slate-400",
                            )}
                            title={room.status.replace("_", " ")}
                          />
                          <span className="text-sm font-medium">
                            {room.room_number}
                          </span>
                        </div>

                        {/* Lane */}
                        <Lane
                          room={room}
                          stays={staysByRoom.get(room.id) ?? []}
                          days={days}
                          start={start}
                          today={today}
                          dayW={dayW}
                          onOpen={(id) => navigate(`/reservations/${id}`)}
                        />
                      </div>
                    ))}
                  </div>
                ))}

                {/* Filler: keeps the column grid running to the bottom of the
                    card when the rooms don't fill the available height. It
                    collapses to nothing once the lanes overflow and scroll. */}
                <div className="flex flex-1">
                  <div
                    className="sticky left-0 z-10 shrink-0 border-r border-border bg-card"
                    style={{ width: LEFT_W }}
                  />
                  <div
                    className="relative flex-1"
                    style={{ backgroundImage: gridBg(dayW) }}
                  >
                    <ColumnTints days={days} today={today} dayW={dayW} />
                  </div>
                </div>
              </div>
            </div>

            <Legend />
          </>
        )}
      </div>
    </div>
  );
}

// ── One room lane ────────────────────────────────────────────────────
function Lane({
  room,
  stays,
  days,
  start,
  today,
  dayW,
  onOpen,
}: {
  room: Room;
  stays: TimelineStay[];
  days: Date[];
  start: Date;
  today: Date;
  dayW: number;
  onOpen: (reservationId: string) => void;
}) {
  const windowDays = days.length;
  const offset = (d: Date) => Math.round((d.getTime() - start.getTime()) / DAY_MS);
  const outOfService = room.status !== "available";

  return (
    <div
      className="relative"
      style={{ width: windowDays * dayW, backgroundImage: gridBg(dayW) }}
    >
      <ColumnTints days={days} today={today} dayW={dayW} />

      {/* Out-of-order / maintenance band across the whole window */}
      {outOfService && (
        <div
          className="absolute inset-y-1.5 left-1 flex items-center rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground"
          style={{
            width: windowDays * dayW - 8,
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(100,116,139,0.12) 6px, rgba(100,116,139,0.12) 12px)",
          }}
        >
          {room.status === "out_of_order" ? "Out of order" : "Maintenance"}
        </div>
      )}

      {/* Reservation bars */}
      {!outOfService &&
        stays.map((s) => {
          const ci = parseApiDate(s.check_in);
          const co = parseApiDate(s.check_out);
          const winPx = windowDays * dayW;
          // Half-day convention: a stay starts at the middle of its check-in
          // day and ends at the middle of its check-out day. This leaves the
          // morning of the arrival day and the afternoon of the departure day
          // free, so the same room can be checked out and checked back in on
          // the same day and the two bars sit side by side, meeting mid-cell.
          const rawLeft = (offset(ci) + 0.5) * dayW;
          const rawRight = (offset(co) + 0.5) * dayW;
          const left = Math.max(0, rawLeft);
          const right = Math.min(winPx, rawRight);
          if (right <= left) return null; // outside this window

          const clippedL = rawLeft < 0;
          const clippedR = rawRight > winPx;
          const GAP = 2; // keeps neighbouring bars visually distinct

          return (
            <button
              key={s.id}
              onClick={() => onOpen(s.reservation_id)}
              title={`${s.guest_first_name} ${s.guest_last_name} · Room ${s.room_number} · ${s.check_in.slice(
                0,
                10,
              )} → ${s.check_out.slice(0, 10)}`}
              className={cn(
                "absolute inset-y-1.5 flex items-center overflow-hidden px-2 text-left text-xs font-medium text-white shadow-sm transition-colors",
                BAR[s.status] ?? "bg-slate-500 hover:bg-slate-600",
                clippedL ? "rounded-l-none" : "rounded-l-md",
                clippedR ? "rounded-r-none" : "rounded-r-md",
              )}
              style={{
                left: left + (clippedL ? 0 : GAP),
                width: right - left - (clippedL ? 0 : GAP) - (clippedR ? 0 : GAP),
              }}
            >
              <span className="truncate">
                {s.guest_last_name}
                {s.guest_first_name ? `, ${s.guest_first_name[0]}.` : ""}
              </span>
            </button>
          );
        })}
    </div>
  );
}

// ── Legend ───────────────────────────────────────────────────────────
function Legend() {
  const item = (cls: string, label: string) => (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-4 rounded-sm", cls)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
  const dot = (cls: string, label: string) => (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", cls)} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      {item("bg-blue-500", "Confirmed")}
      {item("bg-emerald-500", "Check In")}
      {item("bg-slate-400", "Checked out")}
      <span className="text-border">|</span>
      {dot("bg-emerald-500", "Available")}
      {dot("bg-amber-500", "Maintenance")}
      {dot("bg-red-500", "Out of order")}
    </div>
  );
}
