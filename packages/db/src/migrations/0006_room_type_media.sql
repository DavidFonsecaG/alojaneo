-- 0006_room_type_media.sql
-- Room types gain marketing content surfaced on the booking engine / OTAs:
-- a free-text description, an amenities list (array of keys), and photos.
--
-- PHOTO STORAGE (MVP): image bytes are stored inline as a base64 data URL in
-- room_type_photos.data_url. This is simple and self-contained but not suitable
-- for production (DB bloat, large payloads). TODO(prod): move photos to object
-- storage (S3 / Cloudflare R2) and store only the object URL here.

alter table room_types add column if not exists description text;
alter table room_types
  add column if not exists amenities jsonb not null default '[]'::jsonb;

create table if not exists room_type_photos (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_type_id uuid not null references room_types(id) on delete cascade,
  data_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists room_type_photos_type_idx
  on room_type_photos (room_type_id, sort_order);

-- Same tenant-isolation contract as every other tenant-scoped table.
alter table room_type_photos enable row level security;
drop policy if exists room_type_photos_tenant_isolation on room_type_photos;
create policy room_type_photos_tenant_isolation on room_type_photos
  using (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid)
  with check (hotel_id = nullif(current_setting('app.current_hotel_id', true), '')::uuid);

grant select, insert, update, delete on room_type_photos to app_user;
