-- 0001_init.sql
-- Creates the slice's tables and enforces tenant isolation at the database
-- layer via Row-Level Security, not just in application code.

create extension if not exists pgcrypto;

create table hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table hotel_users (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'general',
  created_at timestamptz not null default now(),
  unique (hotel_id, user_id)
);

create table room_types (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  name text not null,
  max_occupancy integer not null default 2,
  created_at timestamptz not null default now()
);

-- A dedicated, non-superuser role for the API to connect as. RLS policies
-- are silently bypassed for table owners and superusers, so if the API
-- connected as `postgres` here, every policy below would be a no-op and
-- the isolation test would pass for the wrong reason.
do $$
begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_user_pw';
  end if;
end
$$;

grant usage on schema public to app_user;
grant select, insert, update, delete on hotels, users, hotel_users, room_types to app_user;

-- hotel_users: a row is visible only if it belongs to the hotel currently
-- set on the session. This is what lets us check "is this user a member
-- of this hotel" without leaking membership rows across tenants.
alter table hotel_users enable row level security;
alter table hotel_users force row level security;

create policy hotel_users_tenant_isolation on hotel_users
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);

-- Login needs to answer "which hotel(s) does this user belong to" before
-- any hotel_id context exists yet — that's the whole point of the lookup.
-- This second policy is scoped to SELECT only (it does not grant insert/
-- update/delete) and only ever matches the caller's own user_id, set via
-- a separate session variable. Postgres OR-combines multiple permissive
-- policies for the same command, so a row is visible if it matches EITHER
-- this policy OR the tenant policy above.
create policy hotel_users_self_lookup on hotel_users
  for select
  using (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);

-- room_types: the actual resource under test. Same pattern — both the
-- read filter (USING) and the write guard (WITH CHECK) are required;
-- without WITH CHECK, a connection could still INSERT a row for a
-- different hotel_id than the one in its session context.
alter table room_types enable row level security;
alter table room_types force row level security;

create policy room_types_tenant_isolation on room_types
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid)
  with check (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);
