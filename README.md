# Hotel reservation system

Multi-tenant hotel reservation SaaS targeting hotels in Ecuador/South America.
Single database, shared schema, tenant isolation enforced by Postgres
Row-Level Security (RLS) at the database layer — not just application code.

## What's in here

- `packages/db` — Drizzle schema (`schema.ts`) and hand-written SQL
  migrations with RLS policies. Drizzle-kit is configured for future
  migration generation, but the existing migrations are authoritative for
  the RLS setup.
- `apps/api` — Fastify REST API covering:
  - **Auth** — signup, login, JWT-based sessions, granular permissions
    (admin has implicit full access, general users have per-module flags)
  - **Rooms & inventory** — room types, individual rooms (with
    housekeeping status tracking), rate plans (with cancellation policy,
    min/max stay, online bookability), seasonal rate overrides
  - **Guests** — tenant-scoped guest profiles
  - **Reservations** — multi-room bookings with per-room dates and status
    (confirmed → checked_in → checked_out, or cancelled/no_show). Status
    lives on `reservation_rooms`, not on the parent reservation, so
    individual rooms can be cancelled independently. Status changes record
    an audit trail and auto-flip housekeeping status on checkout.
  - **Payments** — manual and gateway payments, status lifecycle
  - **Housekeeping** — room cleanliness tracking, task assignment and
    completion (auto-updates room status)
  - **Hotel settings** — deposit policy (full/percentage/none), tax config
    (IVA + optional tourism tax), currency
  - **Public booking engine API** — unauthenticated availability search
    and booking creation for guest-facing booking pages
- `tests/` — Integration tests against a real Postgres instance, real JWTs,
  no mocking.

## Running it locally

Requires a local Postgres (the sandbox this was built in installed Postgres
16 via apt and ran the migrations directly — see `packages/db/src/migrations/`
for the exact schema + RLS setup, including creating the `app_user` role
the API connects as).

```
pnpm install
cp .env.example .env   # adjust if your local Postgres differs
psql -d hotel_dev -f packages/db/src/migrations/0001_init.sql
psql -d hotel_dev -f packages/db/src/migrations/0002_extend_schema.sql
psql -d hotel_dev -f packages/db/src/migrations/0003_enhance_schema.sql
pnpm test               # runs the full test suite
pnpm dev:api             # starts the API on :3001
```

## What's deliberately NOT in here yet

- **Frontend apps** — the staff app (React + Vite) and guest-facing booking
  engine UI are not built yet; only the API backend exists.
- **Background jobs** — BullMQ + Redis for emails, webhook processing,
  deposit reminders.
- **Infrastructure-as-code** — Terraform or CDK for AWS (RDS in sa-east-1,
  ECS Fargate, S3 + CloudFront, ElastiCache).
- **Payment processor integrations** — the payment recording and status
  management is built, but actual gateway adapters (PayPhone, PlacetoPay,
  PayPal) for charge/refund/webhook processing are not.
- **Email** — transactional email (confirmation, reminders) via
  Resend/Postmark/SES.
- **OTA/channel manager** — schema is ready (`source`, `channel`,
  `external_reservation_id` on reservations) but no webhook endpoints for
  Booking.com/Expedia.

## Next steps

1. Build the staff frontend (`apps/staff` — React + Vite + Tailwind) with
   the calendar view, reservation detail panel, and settings screens from
   the design wireframes.
2. Build the booking engine frontend (`apps/booking`) — guest-facing
   search/checkout UI backed by the `/public/*` API endpoints.
3. Integrate payment processors (PayPhone, PlacetoPay) via the pluggable
   adapter pattern designed earlier.
4. Add BullMQ workers for email and webhook processing.
5. Infrastructure-as-code for AWS deployment.
