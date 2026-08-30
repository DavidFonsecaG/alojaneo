# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant hotel reservation system SaaS, targeted at hotels in Ecuador/South America. Uses Postgres Row-Level Security (RLS) for hotel-level tenant isolation through a real connection pool. Full API covering auth, rooms, rate plans, guests, reservations (with per-room status), payments, housekeeping, hotel settings, and a public booking engine.

## Commands

```bash
pnpm install                # install all workspace dependencies
pnpm dev:api                # start Fastify API on :3001 (tsx watch)
pnpm test                   # run full test suite (vitest)
pnpm db:migrate             # run all migrations via drizzle-orm migrator
```

Schema generation and inspection (run from `packages/db`):

```bash
pnpm --filter @hrs/db generate   # generate SQL migration from schema.ts changes
pnpm --filter @hrs/db studio     # open Drizzle Studio for DB inspection
```

Run a single test by name:

```bash
pnpm --filter @hrs/api exec vitest run -t "name of test"
```

Tests require a running Postgres instance with all migrations applied:

```bash
psql -d hotel_dev -f packages/db/src/migrations/0001_init.sql
psql -d hotel_dev -f packages/db/src/migrations/0002_extend_schema.sql
psql -d hotel_dev -f packages/db/src/migrations/0003_enhance_schema.sql
psql -d hotel_dev -f packages/db/src/migrations/0004_prevent_double_booking.sql
```

## Architecture

**Monorepo** (pnpm workspaces): `apps/api` (Fastify REST API) and `packages/db` (Drizzle schema + SQL migrations).

### Tenant isolation model

Every tenant-scoped table has RLS enabled. The API connects as `app_user` (not a superuser) so RLS policies are enforced. Isolation works via per-transaction session variables:

- **`withTenant(hotelId, fn)`** (`apps/api/src/db.ts`) — wraps `fn` in a transaction with `SET LOCAL app.current_hotel_id`. Every query that touches tenant-scoped data must go through this. Never use raw unscoped queries for tenant data.
- **`withUserContext(userId, fn)`** — sets `app.current_user_id` for the login flow, where the user's hotel membership must be looked up before any hotel context exists.
- **`sqlUnscoped`** — for genuinely non-tenant queries (user lookup by email, `hotels`/`users` table access — the only two tables without RLS). A query run without any context helper sees zero rows from RLS-protected tables (fail-closed).

The **public booking engine** is *not* an unscoped path: it resolves the hotel from the URL slug via `sqlUnscoped` (the `hotels` table has no RLS), then runs every tenant-scoped query — availability lookup and booking creation — inside `withTenant(hotel.id, …)`. Because there is no JWT, the hotel id comes from the slug rather than `req.hotelId`, but the RLS contract is identical to the authenticated routes: reads and writes to `room_types`, `rooms`, `rate_plans`, `guests`, `reservations`, and `reservation_rooms` only work with the tenant context set.

`SET LOCAL` (not `SET`) is critical: it scopes the session variable to the current transaction only, so pooled connections don't leak tenant context across requests.

### Known RLS gotcha (has regression test)

After a transaction using `SET LOCAL` commits, Postgres reverts the session parameter to an empty string, not `NULL`. All RLS policies use `nullif(current_setting('app.current_hotel_id', true), '')::uuid` to guard against this.

### Auth & permissions

JWT-based (bcryptjs + jsonwebtoken). Token payload: `{ userId, hotelId, role }`. The `requireAuth` middleware extracts these onto `req.hotelId`, `req.userId`, `req.role`.

Permissions are granular per-module via a JSONB column on `hotel_users`. Admin role has implicit full access; general users are checked against their permissions object. Use `requirePermission(module, action)` middleware factory for route-level enforcement.

### Reservation model (per-room status)

Reservations are "folders" — status, check_in, and check_out live on `reservation_rooms`, not on `reservations`. This allows individual rooms within a multi-room booking to be cancelled/checked-in independently. Status changes go through `PATCH /reservation-rooms/:id/status`, which also records an audit trail in `reservation_status_history` and auto-flips `rooms.housekeeping_status` to 'dirty' on checkout.

**Double-booking is prevented in the database, not the app.** Migration `0004_prevent_double_booking.sql` adds a GiST exclusion constraint (`reservation_rooms_no_overlap`, requires the `btree_gist` extension) that forbids two active stays of the same room from overlapping in time. Cancelled/no-show stays are excluded from the constraint (they release the room); dates use a half-open `daterange(check_in, check_out, '[)')` so a same-day checkout/checkin handoff is not an overlap. Both write paths also run a friendly availability pre-check, but the constraint is the real guard: it holds across the read-then-write race under the connection pool and is not subject to RLS, so it covers the staff API, the public booking engine, and any future OTA ingestion. Overlap violations (SQLSTATE `23P01`) are translated to HTTP `409` in `reservations.ts` and `publicBooking.ts`.

### Schema

Drizzle-kit is configured (`packages/db/drizzle.config.ts`). The hand-written migrations (`0001_init.sql`, `0002_extend_schema.sql`, `0003_enhance_schema.sql`) remain authoritative for schema + RLS since drizzle-kit doesn't manage RLS policies.

Tables: `hotels` (tenant + settings), `users`, `hotel_users` (membership + role + permissions), `room_types`, `rooms` (with housekeeping_status), `rate_plans` (with cancellation_policy, bookable_online), `rate_overrides`, `guests`, `reservations`, `reservation_rooms` (with per-room dates + status), `reservation_notes`, `reservation_status_history`, `housekeeping_tasks`, `payments`.

RLS is on all tenant-scoped tables. `reservation_rooms`, `reservation_notes`, `reservation_status_history`, and `rate_overrides` use transitive isolation via FK to their parent RLS-protected tables.

### API routes

**Public (no auth):**
- `POST /auth/signup`, `POST /auth/login`
- `GET /public/:hotelSlug/availability` — availability search with date/occupancy filtering
- `POST /public/:hotelSlug/bookings` — guest-facing booking creation

**Authenticated (all require Bearer JWT):**
- `GET/POST /room-types`
- `GET/POST /rooms`, `GET/PATCH/DELETE /rooms/:id`, `PATCH /rooms/:id/housekeeping`
- `GET/POST /rate-plans`, `GET/PUT/DELETE /rate-plans/:id`, `POST/GET /rate-plans/:id/overrides`, `DELETE /rate-overrides/:id`
- `GET/POST /guests`, `GET/PUT/DELETE /guests/:id`
- `GET/POST /reservations`, `GET /reservations/:id`, `PATCH /reservation-rooms/:id/status`, `POST /reservations/:id/notes`
- `GET/POST /payments`, `GET /payments/:id`, `PATCH /payments/:id/status`
- `GET /housekeeping`, `GET/POST /housekeeping/tasks`, `PATCH /housekeeping/tasks/:id`
- `GET/PATCH /hotel/settings`, `GET/PATCH /hotel/profile`

### Testing approach

Tests use `app.inject()` against a real Postgres instance with real JWTs — no mocking. The vitest config in `apps/api` points to `../../tests/` for test discovery. Test files:
- `tests/tenant-isolation.test.ts` — RLS isolation across tenants with concurrent pooled connections
- `tests/entity-crud.test.ts` — CRUD for rooms, rate plans, guests, hotel settings, housekeeping
- `tests/reservation-flow.test.ts` — full lifecycle: create with rooms, per-room status transitions, notes, payments, housekeeping auto-flip, cross-tenant isolation
