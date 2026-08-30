-- 0004_prevent_double_booking.sql
-- Prevents two active bookings of the same room from overlapping in time,
-- enforced at the database layer — matching this project's philosophy of
-- guaranteeing invariants in Postgres rather than trusting application code
-- (the same reason tenant isolation lives in RLS, not in WHERE clauses).
--
-- Why the app-level check isn't enough: availability is read-then-write, and
-- under a connection pool two concurrent requests can both read "room is
-- free" before either inserts, producing a double-booking. A GiST exclusion
-- constraint closes that gap — the second overlapping insert fails atomically
-- with SQLSTATE 23P01 (exclusion_violation). Constraint enforcement is not
-- subject to RLS, so this holds for every write path (staff API, public
-- booking engine, and any future OTA ingestion) regardless of tenant context.

-- btree_gist provides the `=` operator class for uuid inside a GiST index,
-- which the exclusion constraint needs alongside the range-overlap (&&) op.
create extension if not exists btree_gist;

alter table reservation_rooms
  add constraint reservation_rooms_no_overlap
  exclude using gist (
    room_id with =,
    daterange(check_in, check_out, '[)') with &&
  )
  -- Cancelled and no-show stays release the room, so they are excluded from
  -- the constraint (a cancelled booking must not block a new one). The
  -- half-open range '[)' means a same-day checkout/checkin handoff (guest A
  -- checks out, guest B checks in on the same date) is not counted as an
  -- overlap, which is the correct hotel semantics.
  where (status not in ('cancelled', 'no_show'));
