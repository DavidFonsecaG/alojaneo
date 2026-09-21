-- Email login codes (2FA): after a correct password we issue a short-lived
-- one-time numeric code, emailed to the user, that must be verified to finish
-- logging in. No RLS — codes are looked up during authentication, before any
-- tenant context exists, keyed by user_id only. The code itself is stored
-- hashed (bcrypt), never in plaintext.
create table login_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index login_codes_user_idx on login_codes(user_id);
grant select, insert, update, delete on login_codes to app_user;

-- Platform owner (the developer running the SaaS) — a cross-hotel system
-- administrator, distinct from a hotel's own admin. Used by the separate
-- admin app / owner-only /platform/* routes.
alter table users add column if not exists is_platform_owner boolean not null default false;
