-- ─────────────────────────────────────────────────────────────────────
-- Human-friendly, per-hotel sequential booking reference (e.g. BK-1029).
--
-- The counter lives on the hotel row so it can be advanced atomically
-- inside the same transaction that creates a reservation (a row lock on
-- the hotel serialises concurrent bookings). booking_ref is unique per
-- hotel. Numbers start at 1001 so refs read as four digits from day one.
--
-- Idempotent: safe to run more than once.
-- ─────────────────────────────────────────────────────────────────────

alter table hotels add column if not exists booking_seq bigint not null default 1000;
alter table reservations add column if not exists booking_ref text;

-- Backfill reservations that don't have a ref yet, numbered per hotel by
-- creation order. (Matches the read-time formula: 1000 + creation rank.)
with numbered as (
  select
    id,
    1000 + row_number() over (partition by hotel_id order by created_at, id) as n
  from reservations
)
update reservations r
set booking_ref = 'BK-' || nm.n
from numbered nm
where nm.id = r.id
  and r.booking_ref is null;

-- Advance each hotel's counter past whatever was backfilled.
update hotels h
set booking_seq = greatest(
  h.booking_seq,
  coalesce(
    (select max(split_part(r.booking_ref, '-', 2)::bigint)
       from reservations r
      where r.hotel_id = h.id),
    h.booking_seq
  )
);

alter table reservations alter column booking_ref set not null;

create unique index if not exists reservations_hotel_booking_ref_uniq
  on reservations (hotel_id, booking_ref);
