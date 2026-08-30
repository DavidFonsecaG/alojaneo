-- 0003_enhance_schema.sql
-- Adds housekeeping, permissions, per-room reservation status, hotel settings,
-- rate plan enhancements, reservation notes/history, rate overrides, and
-- OTA-readiness fields. Follows the full design from the planning phase.

-- ─── Hotels: deposit policy + tax config ──────────────────────────────

alter table hotels add column deposit_policy_type text not null default 'none';
alter table hotels add column deposit_percentage integer;
alter table hotels add column tax_rate integer;
alter table hotels add column tourism_tax_rate integer;
alter table hotels add column currency text not null default 'USD';

-- ─── Hotel users: granular permissions ────────────────────────────────

alter table hotel_users add column permissions jsonb;

-- ─── Rooms: housekeeping status ───────────────────────────────────────

alter table rooms add column housekeeping_status text not null default 'clean';

-- ─── Rate plans: cancellation, stay limits, online bookability ────────

alter table rate_plans add column cancellation_policy text;
alter table rate_plans add column min_stay integer;
alter table rate_plans add column max_stay integer;
alter table rate_plans add column bookable_online boolean not null default true;

-- ─── Rate overrides: seasonal pricing ─────────────────────────────────

create table rate_overrides (
  id uuid primary key default gen_random_uuid(),
  rate_plan_id uuid not null references rate_plans(id) on delete cascade,
  override_date date not null,
  rate_cents integer not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on rate_overrides to app_user;

-- rate_overrides inherits tenant isolation transitively through rate_plans (RLS-protected).
alter table rate_overrides enable row level security;
alter table rate_overrides force row level security;
create policy rate_overrides_tenant_isolation on rate_overrides
  using (
    exists (select 1 from rate_plans where rate_plans.id = rate_overrides.rate_plan_id)
  )
  with check (
    exists (select 1 from rate_plans where rate_plans.id = rate_overrides.rate_plan_id)
  );

-- ─── Reservations: move status to reservation_rooms, add OTA fields ──

-- Remove check_in, check_out, status, notes from reservations — these now
-- live on reservation_rooms (per-room granularity) and reservation_notes.
alter table reservations drop column if exists check_in;
alter table reservations drop column if exists check_out;
alter table reservations drop column if exists status;
alter table reservations drop column if exists notes;
alter table reservations add column source text not null default 'manual';
alter table reservations add column external_reservation_id text;
alter table reservations add column channel text;

-- ─── Reservation rooms: add dates + status (per-room granularity) ─────

alter table reservation_rooms add column check_in date not null default current_date;
alter table reservation_rooms add column check_out date not null default current_date;
alter table reservation_rooms add column status text not null default 'confirmed';

-- Remove the defaults after migration (they only exist to satisfy NOT NULL for any existing rows)
alter table reservation_rooms alter column check_in drop default;
alter table reservation_rooms alter column check_out drop default;

-- ─── Reservation notes ────────────────────────────────────────────────

create table reservation_notes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  user_id uuid references users(id),
  body text not null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on reservation_notes to app_user;

alter table reservation_notes enable row level security;
alter table reservation_notes force row level security;
create policy reservation_notes_tenant_isolation on reservation_notes
  using (
    exists (select 1 from reservations where reservations.id = reservation_notes.reservation_id)
  )
  with check (
    exists (select 1 from reservations where reservations.id = reservation_notes.reservation_id)
  );

-- ─── Reservation status history (audit trail per reservation_room) ────

create table reservation_status_history (
  id uuid primary key default gen_random_uuid(),
  reservation_room_id uuid not null references reservation_rooms(id) on delete cascade,
  old_status text not null,
  new_status text not null,
  changed_by uuid references users(id),
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on reservation_status_history to app_user;

alter table reservation_status_history enable row level security;
alter table reservation_status_history force row level security;
create policy reservation_status_history_tenant_isolation on reservation_status_history
  using (
    exists (
      select 1 from reservation_rooms
      where reservation_rooms.id = reservation_status_history.reservation_room_id
    )
  )
  with check (
    exists (
      select 1 from reservation_rooms
      where reservation_rooms.id = reservation_status_history.reservation_room_id
    )
  );

-- ─── Housekeeping tasks ───────────────────────────────────────────────

create table housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  assigned_to uuid references users(id),
  task_type text not null,
  status text not null default 'pending',
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on housekeeping_tasks to app_user;

alter table housekeeping_tasks enable row level security;
alter table housekeeping_tasks force row level security;
create policy housekeeping_tasks_tenant_isolation on housekeeping_tasks
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid)
  with check (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);
