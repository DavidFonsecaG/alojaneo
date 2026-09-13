// API response shapes for the public booking endpoints
// (apps/api/src/routes/publicBooking.ts). Hand-written to keep this app
// decoupled from the server.

// GET /public/:hotelSlug — hotel info + branding for the engine.
export interface HotelInfo {
  name: string;
  slug: string;
  currency: string;
  bannerUrl: string | null;
  bannerPosition: number; // 0–100 (%) vertical focal point
  accentColor: string | null;
}

// One entry of GET /public/:hotelSlug/availability
export interface AvailabilityRatePlan {
  id: string;
  name: string;
  baseRateCents: number;
  cancellationPolicy: string | null;
  currency: string;
}

export interface AvailabilityRoomType {
  id: string;
  name: string;
  maxOccupancy: number;
  description: string | null;
  amenities: string[];
  photos: string[]; // base64 data URLs (MVP)
}

export interface AvailabilityItem {
  roomType: AvailabilityRoomType;
  availableCount: number;
  ratePlans: AvailabilityRatePlan[];
}

// Search parameters that drive availability.
export interface SearchParams {
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
}

// POST /public/:hotelSlug/bookings body
export interface BookingRequest {
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  rooms: { roomTypeId: string; ratePlanId: string }[];
  checkIn: string;
  checkOut: string;
}

// POST /public/:hotelSlug/bookings response
export interface BookingConfirmation {
  reservationId: string;
  hotelName: string;
  guest: { firstName: string; lastName: string; email: string };
  checkIn: string;
  checkOut: string;
  totalAmountCents: number;
  currency: string;
  rooms: {
    id: string;
    roomId: string;
    ratePlanId: string;
    rateCents: number;
    checkIn: string;
    checkOut: string;
    status: string;
  }[];
}
