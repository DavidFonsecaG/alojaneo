-- 0002_extend_schema.sql
-- Adds the full reservation system tables and enforces tenant isolation
-- via RLS on every tenant-scoped table, matching the nullif pattern from
-- 0001_init.sql to guard against the empty-string-after-SET-LOCAL gotcha.

-- Individual rooms belonging to a room type.
create table rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_type_id uuid not null references room_types(id) on delete cascade,
  room_number text not null,
  floor integer,
  status text not null default 'available',
  created_at timestamptz not null default now()
);

create unique index rooms_hotel_id_room_number_idx on rooms (hotel_id, room_number);

-- Pricing plans for room types. Rates in cents to avoid floating-point.
create table rate_plans (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_type_id uuid not null references room_types(id) on delete cascade,
  name text not null,
  base_rate_cents integer not null,
  currency text not null default 'USD',
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now()
);

-- Guest profiles, scoped to a hotel.
create table guests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  document_type text,
  document_number text,
  created_at timestamptz not null default now()
);

-- Core booking entity.
create table reservations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  guest_id uuid references guests(id),
  check_in date not null,
  check_out date not null,
  status text not null default 'confirmed',
  total_amount_cents integer,
  currency text not null default 'USD',
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- Junction: a reservation can book multiple rooms.
create table reservation_rooms (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations(id) on delete cascade,
  room_id uuid not null references rooms(id) on delete cascade,
  rate_plan_id uuid references rate_plans(id),
  rate_cents integer not null,
  created_at timestamptz not null default now()
);

-- Payment records for reservations.
create table payments (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  amount_cents integer not null,
  currency text not null default 'USD',
  method text not null,
  status text not null default 'completed',
  reference text,
  created_at timestamptz not null default now()
);

-- Grant permissions to app_user for all new tables.
grant select, insert, update, delete on rooms, rate_plans, guests, reservations, reservation_rooms, payments to app_user;

-- RLS policies for all tenant-scoped tables.
-- Same nullif(..., '')::uuid pattern as 0001_init.sql — prevents the
-- empty-string-after-SET-LOCAL from matching or throwing a cast error.

alter table rooms enable row level security;
alter table rooms force row level security;
create policy rooms_tenant_isolation on rooms
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid)
  with check (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);

alter table rate_plans enable row level security;
alter table rate_plans force row level security;
create policy rate_plans_tenant_isolation on rate_plans
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid)
  with check (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);

alter table guests enable row level security;
alter table guests force row level security;
create policy guests_tenant_isolation on guests
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid)
  with check (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);

alter table reservations enable row level security;
alter table reservations force row level security;
create policy reservations_tenant_isolation on reservations
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid)
  with check (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);

-- reservation_rooms has no hotel_id column — isolation is enforced
-- transitively through its FK to reservations and rooms, which are both
-- RLS-protected. A row is visible only if the referenced reservation
-- and room are visible under the current tenant context.
alter table reservation_rooms enable row level security;
alter table reservation_rooms force row level security;
create policy reservation_rooms_tenant_isolation on reservation_rooms
  using (
    exists (
      select 1 from reservations
      where reservations.id = reservation_rooms.reservation_id
    )
  )
  with check (
    exists (
      select 1 from reservations
      where reservations.id = reservation_rooms.reservation_id
    )
  );

alter table payments enable row level security;
alter table payments force row level security;
create policy payments_tenant_isolation on payments
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid)
  with check (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);
