import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  date,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const hotels = pgTable("hotels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // Hotel-wide deposit policy: 'full' | 'percentage' | 'none'
  depositPolicyType: text("deposit_policy_type").notNull().default("none"),
  depositPercentage: integer("deposit_percentage"),
  taxRate: integer("tax_rate"), // basis points (e.g. 1500 = 15.00% IVA)
  tourismTaxRate: integer("tourism_tax_rate"), // optional local tourism tax, basis points
  currency: text("currency").notNull().default("USD"),
  // Public booking-engine branding (see migration 0007). bannerUrl is a base64
  // data URL for the MVP (same approach as room_type_photos); accentColor is a
  // "#rrggbb" hex the engine maps onto its theme tokens.
  bannerUrl: text("banner_url"),
  accentColor: text("accent_color"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Membership + role + granular permissions per hotel.
// Admin role has implicit full access; permissions JSON only applies to 'general' users.
export const hotelUsers = pgTable(
  "hotel_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("general"), // 'admin' | 'general'
    // Granular permission flags for general users, stored as JSON.
    // Example: { "reservations": { "view": true, "create": true, "update": true, "cancel": false },
    //            "rooms": { "view": true, "manage": false }, ... }
    permissions: jsonb("permissions"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueHotelUser: uniqueIndex("hotel_users_hotel_id_user_id_idx").on(
      table.hotelId,
      table.userId,
    ),
  }),
);

export const roomTypes = pgTable("room_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  maxOccupancy: integer("max_occupancy").notNull().default(2),
  description: text("description"),
  amenities: jsonb("amenities").notNull().default([]).$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Marketing photos for a room type. MVP stores the image inline as a base64
// data URL; see 0006_room_type_media.sql for the production storage TODO.
export const roomTypePhotos = pgTable("room_type_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  roomTypeId: uuid("room_type_id")
    .notNull()
    .references(() => roomTypes.id, { onDelete: "cascade" }),
  dataUrl: text("data_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Room number unique per hotel. Housekeeping status tracked independently of reservation status.
export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    roomTypeId: uuid("room_type_id")
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    roomNumber: text("room_number").notNull(),
    floor: integer("floor"),
    status: text("status").notNull().default("available"), // available | maintenance | out_of_order
    housekeepingStatus: text("housekeeping_status").notNull().default("clean"), // clean | dirty | in_progress | inspected
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqueRoomNumber: uniqueIndex("rooms_hotel_id_room_number_idx").on(
      table.hotelId,
      table.roomNumber,
    ),
  }),
);

export const ratePlans = pgTable("rate_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  roomTypeId: uuid("room_type_id")
    .notNull()
    .references(() => roomTypes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  baseRateCents: integer("base_rate_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  cancellationPolicy: text("cancellation_policy"), // 'free' | 'non_refundable' | custom text
  minStay: integer("min_stay"),
  maxStay: integer("max_stay"),
  bookableOnline: boolean("bookable_online").notNull().default(true),
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Date-specific rate overrides for seasonal pricing.
export const rateOverrides = pgTable("rate_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  ratePlanId: uuid("rate_plan_id")
    .notNull()
    .references(() => ratePlans.id, { onDelete: "cascade" }),
  overrideDate: date("override_date").notNull(),
  rateCents: integer("rate_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const guests = pgTable("guests", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  documentType: text("document_type"), // 'passport' | 'national_id'
  documentNumber: text("document_number"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Reservation is a "folder" grouping guest + rooms + payments.
// Per-room status lives on reservation_rooms, not here.
export const reservations = pgTable("reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  guestId: uuid("guest_id").references(() => guests.id),
  totalAmountCents: integer("total_amount_cents"),
  currency: text("currency").notNull().default("USD"),
  source: text("source").notNull().default("manual"), // manual | direct_booking | phone | walk_in (OTA values reserved)
  externalReservationId: text("external_reservation_id"),
  channel: text("channel"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Each room-stay within a reservation. Status and dates are per-room
// so individual rooms can be cancelled independently.
//
// A GiST exclusion constraint (`reservation_rooms_no_overlap`, migration
// 0004) forbids two active stays of the same room from overlapping in time.
// Like the RLS policies, it lives in the hand-written SQL migrations because
// drizzle-kit does not manage exclusion constraints.
export const reservationRooms = pgTable("reservation_rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  reservationId: uuid("reservation_id")
    .notNull()
    .references(() => reservations.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  ratePlanId: uuid("rate_plan_id").references(() => ratePlans.id),
  rateCents: integer("rate_cents").notNull(),
  checkIn: date("check_in").notNull(),
  checkOut: date("check_out").notNull(),
  status: text("status").notNull().default("confirmed"), // confirmed | checked_in | checked_out | cancelled | no_show
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reservationNotes = pgTable("reservation_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  reservationId: uuid("reservation_id")
    .notNull()
    .references(() => reservations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Tracks every status change on a reservation_room for audit.
export const reservationStatusHistory = pgTable("reservation_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  reservationRoomId: uuid("reservation_room_id")
    .notNull()
    .references(() => reservationRooms.id, { onDelete: "cascade" }),
  oldStatus: text("old_status").notNull(),
  newStatus: text("new_status").notNull(),
  changedBy: uuid("changed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const housekeepingTasks = pgTable("housekeeping_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  assignedTo: uuid("assigned_to").references(() => users.id),
  taskType: text("task_type").notNull(), // 'checkout_clean' | 'stayover_clean' | 'deep_clean' | 'inspection'
  status: text("status").notNull().default("pending"), // pending | in_progress | completed
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  hotelId: uuid("hotel_id")
    .notNull()
    .references(() => hotels.id, { onDelete: "cascade" }),
  reservationId: uuid("reservation_id")
    .notNull()
    .references(() => reservations.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  method: text("method").notNull(), // 'cash' | 'credit_card' | 'bank_transfer' | 'payphone' | 'placetopay' | 'paypal'
  status: text("status").notNull().default("completed"), // pending | completed | refunded | failed
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
