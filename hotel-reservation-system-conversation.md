# Hotel Reservation System — Design & Build Conversation

A record of the full design-through-build conversation for a multi-tenant
hotel reservation SaaS system, targeted primarily at hotels in
Ecuador/South America.

Note: several points in this conversation included interactive visual
mockups (SVG diagrams, ERDs, and HTML UI wireframes) rendered inline in
the chat as widgets. Those can't be reproduced as static text, so they are
described in `[Widget: ...]` blocks below at the point they appeared,
summarizing what was shown and why.

---

## 1. Initial request and system design

**User's opening request:** Design a multi-tenant hotel reservation
system. Each hotel has its own account/instance. User types: admin (full
access) and general (customized permissions). Login via email/password.

Core modules requested:
- A **calendar view** (rooms on the Y axis, dates on the X axis) for
  managing reservations — guest details, dates, status management,
  comments/notes, payments, with support for multiple rooms per guest.
- A **rooms module** to set up room types, individual rooms within types,
  and rate plans per room type.
- A **direct booking** module — a guest-facing booking engine, deployable
  either as a hosted URL or an embeddable widget.
- A **payments module** — payment methods, rates, tax, accepted payments,
  with a focus on Ecuador/South America (PayPal and other SaaS-friendly
  processors considered).
- A **reports module**.

### Claude's initial architecture proposal

**1. Multi-tenancy & account model**
- Single database, shared schema, `hotel_id` on every tenant-scoped table,
  enforced via Postgres Row-Level Security (RLS) rather than
  database-per-tenant (simpler to operate, scales adequately).
- Core entities: `hotels` (tenant), `users` (global identity),
  `hotel_users` (join table: user ↔ hotel ↔ role/permissions), `roles`,
  `permissions`.
- Auth: email + password, hashed (bcrypt/argon2), JWT/session-based, with
  email verification and password reset flows.

**2. Roles & permissions**
- Two tiers: **Admin** (implicit full access, can't be restricted) and
  **General** (granular permission flags across Reservations,
  Rooms/Inventory, Direct Booking, Payments, Reports, Users).

**3. Reservations & calendar module**
- Calendar: Y-axis = rooms (grouped by type), X-axis = dates, reservation
  bars color-coded by status.
- Data model: `reservations` (logical booking) → `reservation_rooms`
  (one row per room-stay, since one reservation can span multiple rooms)
  → `guests` (reusable guest profiles) → `reservation_status_history` →
  `reservation_notes` → `payments`.
- Proposed status lifecycle (later revised): inquiry/hold → confirmed →
  checked_in → checked_out → cancelled / no_show.
- Clicking a reservation opens a detail panel: guest info, per-room
  dates/status, notes thread, payment history.

**4. Rooms module**
- Two-level hierarchy: `room_types` (name, capacity, amenities) →
  `rooms` (physical room, number, floor, status) and `rate_plans`
  (belong to a room type — pricing model, cancellation policy, min/max
  stay, online-bookable flag), with `rate_overrides` for date-specific
  seasonal pricing.

**5. Direct booking (booking engine) module**
- Two distribution modes sharing the same backend: a hosted URL
  (`book.yoursaas.com/hotel-slug`) and an embeddable JS widget/iframe.
- Booking flow: date/occupancy search → available room types & rates →
  selection → guest details → payment → confirmation.
- Config: branding, which rate plans are bookable online, booking window
  rules, deposit policy, confirmation email template.

**6. Payments module**
- Market reality flagged: Stripe doesn't support Ecuadorian merchants
  directly; PayPal has weak acceptance of Ecuadorian-issued cards; real
  answer is local/regional processors — **PlacetoPay**, **PayPhone**
  (Ecuador-specific), **Kushki**, **Datafast**.
- Recommended a **pluggable processor adapter pattern**
  (`createCharge()`, `refund()`, `getStatus()` per processor) so a hotel
  can run multiple processors simultaneously.
- Manual payment recording (cash, bank transfer, terminal) alongside
  gateway payments.
- Tax: configurable hotel-wide rate(s) — Ecuador IVA (15%) plus optional
  local tourism tax.

**7. Reports module**
- Occupancy, revenue (by date/room type/rate plan/payment method),
  ADR/RevPAR, source of booking, cancellations/no-shows, pending balances
  — all derivable from the reservations + payments tables without a
  separate reporting schema.

### Clarifying questions asked, and answers

| Question | Answer |
|---|---|
| Multi-property per account, or strictly one hotel per account? | **One hotel per account only.** |
| Overbooking protection only, or full housekeeping status tracking (clean/dirty/inspected)? | **Full housekeeping status tracking.** |
| Design the data model to allow future OTA/channel manager integration (Booking.com, Expedia), even if not built now? | **Yes, design for it.** |

### Design updates based on those answers

- **Tenant model simplified**: `hotels` ↔ `hotel_users` is a clean
  one-to-many; no multi-property switcher UI needed.
- **Housekeeping module added**: `rooms.housekeeping_status`
  (clean → dirty → in_progress → inspected, plus a parallel
  out_of_order/maintenance block state). New `housekeeping_tasks` table
  (room_id, assigned_to, task_type, status). Checkout auto-flips a room to
  dirty. Room availability checks gate on **two** conditions: date/
  reservation conflict AND housekeeping/maintenance block.
- **OTA-readiness (schema only, not built)**: `reservations.source` enum
  (direct_booking / manual / phone / walk_in / reserved values for
  booking_com, expedia, etc.), `external_reservation_id` +
  `channel` columns (nullable), and a single internal choke-point
  function (e.g. `createReservationRooms()`) that all booking writes go
  through — exactly where a future channel manager webhook would plug in.

`[Widget: a module-architecture diagram — two input sources (Direct
booking engine, Staff calendar & PMS) feeding a shared "Core data store"
(rooms, rate plans, reservations, guests), with three consumer modules
reading from it: Housekeeping, Payments, Reports.]`

---

## 2. Reservation status & cancellation granularity

**User's decisions:**
- Reservation status set: **confirmed → checked_in → checked_out**, with
  **cancelled** / **no_show** as terminal branches (no separate
  hold/pending stage — a reservation only exists once actually confirmed).
- **One room can be cancelled independently** within a multi-room
  reservation.
- **Deposit/payment policy is a hotel-wide setting**, not per rate plan.

### Resulting schema decisions

- Status lives on `reservation_rooms`, not on the parent `reservations`
  row, since cancellation granularity is per-room. The reservation itself
  becomes a "folder" grouping guest + rooms + payments; its overall state
  is a derived display value.
- `hotels.deposit_policy` — a single config block (type: full payment / %
  deposit / pay-at-property, plus timing rules), applied uniformly
  regardless of rate plan.

`[Widget: a full ERD (rendered via mermaid.js erDiagram) showing HOTELS,
HOTEL_USERS, ROOM_TYPES, ROOMS, RATE_PLANS, GUESTS, RESERVATIONS,
RESERVATION_ROOMS, PAYMENTS and their relationships and key fields.]`

Noted but not diagrammed: `reservation_status_history` (now hangs off
`reservation_rooms`), `reservation_notes`, `housekeeping_tasks`,
`rate_overrides`.

---

## 3. Wireframes

Built in sequence, each as an interactive HTML/SVG widget rendered inline:

### Reservations calendar
`[Widget: calendar grid — rooms (101–301 across Standard/Deluxe/Suite
types) on the Y axis, a 10-day date range on the X axis. Reservation bars
color-coded by status (confirmed=blue, checked_in=green,
checked_out=gray, cancelled=coral/dashed/struck-through,
no_show=red/struck-through). A multi-room reservation (the "Garcia"
family across rooms 101/102/103) renders as separate bars per room rather
than one merged bar, with room 103 shown cancelled independently while
101/102 stay confirmed. A small housekeeping-status dot sits next to each
room label. Today's date column is highlighted. Legend at the bottom.]`

Key design points called out: multi-room reservations stay row-per-room
(the real inventory unit); a cancelled room-stay remains *visible* rather
than disappearing; housekeeping status is independent of reservation
status; empty cells imply availability.

### Reservation detail panel
Triggered by clicking the Garcia/room 101 bar.

`[Widget: a card showing guest info (Mariana Garcia), reservation
reference, source/booked-date; a Rooms section listing 101 and 102 as
confirmed with editable status dropdowns, and 103 as a static "Cancelled"
pill (no dropdown — cancelling is treated as terminal, not reversible via
the same control); a Notes section with a timestamped comment feed plus
an add-note input; a Payments section listing one deposit payment and a
running total/paid/balance-due breakdown that excludes the cancelled
room.]`

Design notes: cancelled rooms are excluded from totals; the status
dropdown reflects admin permissions (a general user without that
permission would see a static pill instead); deposit/refund policy for
an already-cancelled room with a deposit already collected was flagged as
an open policy question.

### Rooms & rate plans setup
`[Widget: a two-column settings screen — left sidebar lists room types
(Standard selected, Deluxe, Suite) with room counts; right panel shows
the selected type's details, a Rooms table (room number, floor, status —
including a "Maintenance" badge on room 103, matching the calendar's
housekeeping concept), and a Rate plans table (Flexible Rate $80/night,
Non-Refundable $68/night, each with a cancellation policy and an "Online"
bookable checkmark).]`

Flagged as an open question: rate plans are scoped to room *type*, not
individual rooms — uniform pricing within a type. Per-room pricing
differentiation (e.g. a balcony room costing more) would require a schema
change.

### Add-room form
Triggered by clicking "+ Add room" on the Standard type.

`[Widget: a modal form — Room number, Floor, Status (Active/Maintenance/
Out of order), Cancel/Save buttons. Deliberately minimal since rate plans
are inherited from the room type, not set per room.]`

### Direct booking engine — search results
`[Widget: guest-facing booking page — hotel name header, a search-recap
bar (dates, nights, guests, "Edit search"), then room-type cards
(Standard, Deluxe, Suite) each with a photo placeholder, occupancy/bed
info, and one row per bookable rate plan showing nightly rate, total for
the stay, a "Free cancellation" tag where applicable, and a Select
button.]`

Design notes: only rate plans flagged `bookable_online` appear here;
maintenance/out-of-order rooms silently reduce sellable inventory without
any scarcity messaging (flagged as an open question); pricing shown is
base × nights with no tax/fee breakdown yet (deferred to checkout).

### Direct booking engine — checkout/payment
`[Widget: two-column checkout — guest details form (name, email, phone)
and a payment-method picker (PayPhone selected by default, then
PlacetoPay, then PayPal) on the left; an order summary card on the right
showing room/nights, room subtotal, IVA (15%), total, then the
hotel-wide deposit policy applied (30% due now / balance due at
property), and a "Pay deposit" button.]`

Design notes: PayPhone defaulted ahead of PayPal to reflect the
local-processor-first decision; IVA computed on the full stay total
before the deposit split; no inline date-editing at checkout (flagged as
an open question); deposit math is purely a render of the hotel-wide
policy config, no booking-engine-specific logic.

### Payments module settings
`[Widget: a settings screen — left column lists payment processors
(PayPhone "Default", PlacetoPay, PayPal, Manual payment) each with a
Configure button and an on/off toggle, all shown enabled simultaneously;
right column has Tax fields (IVA rate, optional tourism tax) and the
hotel-wide Deposit policy fields (Type, Deposit percentage, Due timing)
with a Save button.]`

Design notes: multiple processors can be active at once (confirms the
adapter-pattern decision); "Configure" (credentials) is separate from the
enable/disable toggle so a hotel can disable a misbehaving processor
without losing its saved credentials.

---

## 4. A real-world reference point (uploaded video)

The user uploaded a short video clip, which turned out to be a marketing
clip of **Mews**, a real commercial hotel PMS, showing its booking
calendar UI (room rows with colored status dots, lock icons on
reservation bars for keycard/checked-in state, inline group/accessibility
icons, a "Select space" filter, a highlighted date column).

Claude inspected the video (extracted frames via ffmpeg) and discussed
the patterns at a conceptual level — explicitly not replicating Mews'
branding or exact visual system — and offered to fold specific ideas
(more prominent housekeeping-status dot, inline bar icons for
locked/group/accessible) into the existing design. The user moved on
without selecting a specific change, so the team proceeded to the next
planned module instead of blocking on it.

---

## 5. Tech stack and infrastructure

### Decision: all-TypeScript, end to end

Reasoning: the system has three surfaces sharing the same domain types
(staff app, public booking engine, future channel-manager API) — keeping
everything in TS means a type like `ReservationRoom` is defined once and
shared everywhere, with no drift between e.g. a Pydantic model and a TS
interface.

**Proposed monorepo structure** (pnpm workspaces + Turborepo):
- `apps/staff` — internal app (React + Vite + TS + Tailwind)
- `apps/booking` — public booking engine (separate app: different auth,
  different performance/SEO needs)
- `apps/api` — Node + Fastify backend serving both
- `packages/db` — Drizzle schema + migrations
- `packages/shared` — Zod schemas and shared business logic (deposit/tax
  math) used by both frontend display and backend enforcement

**Database access:** Drizzle, not Prisma — closer to raw SQL, which
matters for the RLS-based multi-tenancy approach (setting a per-request
session variable is awkward through Prisma's abstraction).

**Multi-tenancy enforcement:** every authenticated request resolves
`hotel_id` from the JWT, sets it as a Postgres session variable, and RLS
policies on every tenant table enforce it at the database layer — not
just in application code.

**Background jobs:** BullMQ + Redis (emails, async payment webhook
processing, deposit reminders). **Email:** Resend/Postmark. **Storage:**
Cloudflare R2 (S3-compatible) for room photos — later folded into S3 once
the AWS decision was made.

### Decisions confirmed via direct questions

| Question | Answer |
|---|---|
| API style: tRPC vs REST/OpenAPI? | **REST/OpenAPI** — more boilerplate, but easier to expose to future integrations (channel managers, etc.). |
| Hosting: managed PaaS (Railway/Render) vs more control (Fly.io/AWS)? | **More control (Fly.io/AWS).** |

### Infrastructure shape settled on

AWS, specifically **sa-east-1 (São Paulo)** — closest major cloud region
to Ecuador, relevant for both guest-facing latency and payment processor
round-trips.

- **RDS Postgres** (sa-east-1) — source of truth, RLS-enforced
- **ECS Fargate** behind an Application Load Balancer — runs the Node/
  Fastify API
- **ElastiCache Redis** — backs BullMQ
- **S3 + CloudFront** — room photos plus static hosting for the booking
  engine app
- **SES** (or Resend/Postmark) — transactional email

`[Widget: an infrastructure diagram — three input boxes (Staff browser,
Guest browser, Payment webhooks) all arrowing down into a single "ALB +
ECS Fargate" hub box, which arrows down into three boxes: RDS Postgres
(Row-level security), ElastiCache Redis (BullMQ background jobs), and S3
+ CloudFront (Photos, static assets).]`

Noted: payment webhooks hit the same API service via dedicated signed-
verification routes rather than a separate webhook server; the booking
engine's static bundle is served from CloudFront while its dynamic data
still goes through the same Fargate API as the staff app — one service,
not two, at this stage.

### REST API surface sketched (skeleton, not full spec)

```
Auth
  POST /auth/login
  POST /auth/logout
  POST /auth/refresh

Reservations
  GET  /reservations                      (calendar range query)
  POST /reservations
  GET  /reservations/:id
  PATCH /reservation-rooms/:id            (status change, dates)
  POST /reservation-rooms/:id/notes

Rooms & rates
  GET/POST   /room-types
  GET/POST/PATCH /rooms
  GET/POST/PATCH /rate-plans
  GET/PATCH  /rate-overrides

Payments
  POST /payments                          (manual entry)
  GET  /reservations/:id/payments
  POST /webhooks/:processor

Booking engine (public, no auth)
  GET  /public/:hotelSlug/availability?checkin=&checkout=&guests=
  POST /public/:hotelSlug/bookings

Settings
  GET/PATCH /hotel/settings               (deposit policy, tax, processors)
```

---

## 6. Building the first vertical slice

Decision: rather than scaffold the entire API surface, build one real,
working slice end to end to de-risk the assumptions most likely to be
wrong before committing to the full build — specifically: does
RLS-based tenant isolation actually work, and does it survive a real
connection pool. The user agreed, with the plan to move the project into
Claude Code afterward.

### What was actually built and run (in a live sandbox, not just written)

- Installed **Postgres 16** locally (via apt) and **pnpm**.
- Scaffolded a pnpm-workspace monorepo:
  `apps/api` (Fastify + TypeScript), `packages/db` (Drizzle schema +
  hand-written SQL migration), `tests/` (Vitest).
- **Schema** (`packages/db/src/schema.ts` + matching
  `0001_init.sql`): `hotels`, `users`, `hotel_users` (with `role`),
  `room_types` — the minimum needed to prove tenant isolation, kept
  deliberately boring on purpose.
- **RLS policies**: `hotel_users` and `room_types` both have RLS
  enabled and forced (so even the table owner can't bypass it
  accidentally), using a dedicated non-superuser `app_user` Postgres
  role for the API connection — RLS is silently bypassed for table
  owners/superusers, so connecting as `postgres` would have made the
  whole exercise meaningless.
- **First proof, at raw SQL level** (before any application code):
  seeded two hotels with their own room types, then confirmed via psql
  as `app_user`:
  - Setting tenant context to Hotel A returns only Hotel A's room types.
  - Switching context to Hotel B returns only Hotel B's.
  - Attempting to INSERT a room type for Hotel B while context is set to
    Hotel A is **rejected** by the RLS `WITH CHECK` clause.
  - Querying with no tenant context set at all returns **zero rows**,
    not all rows — fail-closed by default.
- **API layer**: `db.ts` implements a `withTenant(hotelId, fn)` helper
  that wraps every tenant-scoped query in a transaction and uses
  `SET LOCAL` (via `set_config(..., true)`) rather than plain `SET` —
  because the connection is pooled and reused across requests, a plain
  `SET` would leak one hotel's context into a different hotel's later
  request on the same connection.
- **Auth routes**: `POST /auth/signup` (creates a hotel + its first
  admin user in one transaction), `POST /auth/login` (issues a JWT
  containing userId/hotelId/role).
- **`/room-types` routes** (GET/POST), gated behind JWT auth
  middleware that attaches `hotelId`/`userId`/`role` to each request.

### Bugs found and fixed during testing (not hypothetical — caught by running real tests against real Postgres)

1. **Signup initially failed** — inserting the first `hotel_users` row
   for a brand-new hotel violated the RLS policy, because no tenant
   context existed yet for a hotel that didn't exist a moment earlier.
   **Fix:** set `app.current_hotel_id` within the same signup
   transaction immediately after the hotel row is created, before
   inserting the membership row — there's no carve-out for "first row
   ever," the context is just established the moment it's knowable.

2. **Login initially failed** — looking up "which hotel does this user
   belong to" has no tenant context yet by definition. **Fix:** added
   a second, narrowly-scoped RLS policy on `hotel_users`
   (`hotel_users_self_lookup`) that permits a **SELECT-only** match on
   the caller's own `user_id` via a separate `app.current_user_id`
   session variable — it grants no insert/update/delete access and only
   ever matches the caller's own row.

3. **A genuine, non-obvious Postgres/pooling bug**: after a transaction
   does `SET LOCAL app.current_hotel_id = ...` and commits, Postgres
   does **not** revert that custom session parameter to `NULL` on the
   connection — it reverts to an **empty string**. Since the API uses a
   connection pool, a later, unrelated request (e.g. a login, which
   never touches `app.current_hotel_id` at all) can land on that same
   physical connection and see `''` instead of `NULL` for a setting it
   never set. Casting `''::uuid` throws a Postgres error — this is
   fail-closed (not a security leak: it doesn't accidentally match
   another tenant's data) but it's a real correctness bug that would
   surface as confusing intermittent request failures.
   **Fix:** both RLS policies were rewritten to use
   `nullif(current_setting(...), '')::uuid` instead of a bare cast, so
   a leftover empty string is treated identically to "never set."
   **A dedicated regression test was added** —
   "survives a login immediately after a tenant-scoped request reuses
   its pooled connection" — that specifically exercises this exact
   sequence so the bug can't silently reappear.

### Final test results

7/7 tests passing in `tests/tenant-isolation.test.ts`, run against the
real HTTP layer (`app.inject`, no mocking) and a real local Postgres
instance:
- Lets a hotel create and list its own room types
- Never lets hotel B see hotel A's room types, even with concurrent
  interleaved requests across pooled connections
- Rejects requests with no token
- Rejects a tampered token
- Lets a user log in after signup and access their hotel's data
- Rejects login with the wrong password
- Survives a login immediately after a tenant-scoped request reuses its
  pooled connection (the pooling-bug regression test)

### Deliverables produced

- A packaged repo (`hotel-reservation-system.tar.gz`, excluding
  `node_modules`) containing the full monorepo: schema, migration, API
  routes, tests, `.env.example`, `.gitignore`.
- A `README.md` inside the repo documenting: what the slice proves, what
  it deliberately does NOT yet cover (reservations/calendar/rate plans/
  payments/booking engine product code, drizzle-kit migration
  generation, full permissions matrix, infrastructure-as-code, rate
  limiting/observability), how to run it locally, and an ordered list of
  next steps for picking the project up in Claude Code.

---

## 7. Where the project stood at the end of this conversation

- Full product design complete across all originally-requested modules:
  multi-tenancy/auth, reservations & calendar, rooms & rate plans,
  housekeeping, direct booking engine (hosted URL + widget), payments
  (local LatAm processors + PayPal + manual, tax, hotel-wide deposit
  policy), reports (scoped but not wireframed in detail).
- Full data model (ERD) settled, reflecting all product decisions made
  along the way (per-room cancellation granularity, hotel-wide deposit
  policy, OTA-readiness placeholders).
- Wireframes built and reviewed for: calendar, reservation detail panel,
  rooms/rate-plan setup, add-room form, booking-engine search results,
  booking-engine checkout, payments settings.
- Tech stack and AWS infrastructure architecture decided and diagrammed.
- A working, tested vertical slice proving the riskiest backend
  assumption (RLS-based multi-tenancy through a connection pool) was
  built, debugged, and packaged for handoff.
- Explicit next step (per the user): continue the build in Claude Code.
