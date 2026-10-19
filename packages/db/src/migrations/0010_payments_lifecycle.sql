-- 0010_payments_lifecycle.sql
-- Per-hotel payment gateway config + a fuller payment lifecycle, so deposits can
-- be charged through a real gateway (Kushki, PayPhone, …) and settled reliably.
--
-- Design notes:
--  * Gateway config lives as columns on `hotels` (non-RLS), like every other
--    per-hotel setting (deposit policy, taxes, branding). Keeping it here means
--    a webhook — which arrives with no tenant context — can resolve the hotel by
--    its `payment_webhook_token` with an unscoped query, then settle inside
--    withTenant(). The private key is never stored in the clear: it's encrypted
--    at rest (AES-256-GCM) by the app, so the DB only ever holds ciphertext.
--  * The public key is publishable (the booking engine needs it client-side), so
--    it stays plaintext.
--  * `payments` gets explicit provider / client-tx / provider-tx columns (the old
--    single `reference` column was overloaded), plus refund-as-its-own-row and a
--    jsonb audit of the gateway payload.

-- ── Per-hotel gateway config (on hotels, non-RLS) ───────────────────────────
alter table hotels
  add column if not exists payment_provider        text not null default 'mock',  -- kushki | payphone | mock
  add column if not exists payment_public_key       text,
  add column if not exists payment_private_key_enc  text,          -- AES-256-GCM ciphertext (never plaintext)
  add column if not exists payment_webhook_token     text,          -- random; carried in the webhook URL
  add column if not exists payment_enabled           boolean not null default false;

-- The token anchors the (tenant-context-free) webhook URL to a hotel.
create unique index if not exists hotels_payment_webhook_token_idx
  on hotels (payment_webhook_token)
  where payment_webhook_token is not null;

-- ── Payment lifecycle columns ───────────────────────────────────────────────
alter table payments
  add column if not exists provider          text,                 -- kushki | payphone | manual | mock
  add column if not exists client_tx_id      text,                 -- our stable handle for the attempt
  add column if not exists provider_tx_id    text,                 -- the gateway's transaction id
  add column if not exists kind              text not null default 'charge',  -- charge | refund
  add column if not exists parent_payment_id uuid references payments(id),    -- refund -> original charge
  add column if not exists metadata          jsonb,                -- raw gateway payload, for audit/disputes
  add column if not exists updated_at        timestamptz not null default now();

create index if not exists payments_client_tx_id_idx on payments (client_tx_id);
create index if not exists payments_provider_tx_id_idx on payments (provider_tx_id);

-- Backfill existing rows into the new model: split "how" (method) from "who"
-- (provider), and move the old reference into client_tx_id.
update payments set
  provider = case
    when method in ('cash', 'credit_card', 'bank_transfer') then 'manual'
    else method
  end,
  method = case
    when method in ('cash', 'credit_card', 'bank_transfer') then method
    else 'card'
  end,
  client_tx_id = coalesce(client_tx_id, reference)
where provider is null;

-- ── Inbound webhook log (idempotency + audit; global, no tenant scope) ──────
create table if not exists payment_webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_id     text not null,                 -- the gateway's event/notification id
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)                 -- drop duplicate deliveries
);

grant select, insert, update, delete on payment_webhook_events to app_user;
