// API response shapes. These mirror what apps/api returns; kept hand-written
// (rather than shared from the server) to keep the web app decoupled.

export type Role = "admin" | "general";

export type ReservationRoomStatus =
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show";

// Aggregated status the reservations list endpoint computes across rooms.
export type ReservationSummaryStatus =
  | "confirmed"
  | "active"
  | "checked_out"
  | "cancelled";

export interface AuthHotel {
  id: string;
  name: string;
  slug: string;
}

export interface LoginResponse {
  token: string;
  permissions: Record<string, Record<string, boolean>> | null;
}

export interface SignupResponse {
  token: string;
  hotel: AuthHotel;
}

// GET /reservations — one row per reservation "folder".
export interface ReservationListItem {
  id: string;
  guest_id: string;
  total_amount_cents: number | null;
  source: string;
  created_by: string | null;
  created_at: string;
  guest_first_name: string;
  guest_last_name: string;
  check_in: string | null;
  check_out: string | null;
  status: ReservationSummaryStatus;
}

// A single room-stay inside a reservation.
export interface ReservationRoom {
  id: string;
  room_id: string;
  rate_plan_id: string | null;
  rate_cents: number;
  check_in: string;
  check_out: string;
  status: ReservationRoomStatus;
  created_at: string;
  room_number?: string;
}

// GET /reservations/timeline — one row per room-stay overlapping the window,
// flattened with room number + guest name for the tape-chart lanes.
export interface TimelineStay {
  id: string;
  reservation_id: string;
  room_id: string;
  rate_cents: number;
  check_in: string;
  check_out: string;
  status: ReservationRoomStatus;
  room_number: string;
  guest_first_name: string;
  guest_last_name: string;
}

export interface ReservationNote {
  id: string;
  reservation_id: string;
  user_id: string;
  body: string;
  created_at: string;
  user_email: string;
}

// GET /reservations/:id
export interface ReservationDetail {
  id: string;
  guest_id: string;
  total_amount_cents: number | null;
  source: string;
  external_reservation_id: string | null;
  channel: string | null;
  created_by: string | null;
  created_at: string;
  guest_first_name: string;
  guest_last_name: string;
  rooms: ReservationRoom[];
  notes: ReservationNote[];
}

export interface Guest {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  document_type: string | null;
  document_number: string | null;
  created_at: string;
}

export interface RoomType {
  id: string;
  name: string;
  max_occupancy: number;
  created_at: string;
}

export interface Room {
  id: string;
  room_type_id: string;
  room_number: string;
  floor: number | null;
  status: string;
  housekeeping_status: string;
  created_at: string;
  room_type_name?: string;
}

export interface RatePlan {
  id: string;
  room_type_id: string;
  name: string;
  base_rate_cents: number;
  currency: string;
  cancellation_policy: string | null;
  min_stay: number | null;
  max_stay: number | null;
  bookable_online: boolean;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
}

// ── Dashboard ────────────────────────────────────────────────────────
export interface DashboardArrival {
  reservation_id: string;
  first_name: string;
  last_name: string;
  check_in: string;
  status: ReservationRoomStatus;
  room_number: string;
  room_type_name: string;
}

export interface DashboardStatusEvent {
  created_at: string;
  new_status: ReservationRoomStatus;
  room_number: string;
  first_name: string;
  last_name: string;
}

export interface DashboardBooking {
  created_at: string;
  first_name: string;
  last_name: string;
}

export interface DashboardData {
  roomStatus: { total: number; occupied: number; available: number };
  arrivingToday: DashboardArrival[];
  recentStatusEvents: DashboardStatusEvent[];
  recentBookings: DashboardBooking[];
}

export type OccupancySpan = "day" | "week" | "month";

export interface OccupancyPoint {
  date: string;
  occupied: number;
}

export interface OccupancyData {
  total: number;
  span: OccupancySpan;
  series: OccupancyPoint[];
}
