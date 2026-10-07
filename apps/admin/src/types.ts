export interface LoginChallenge {
  challenge: "code";
  email: string;
}

export interface PlatformToken {
  token: string;
}

// GET /platform/hotels
export interface PlatformHotel {
  id: string;
  name: string;
  slug: string;
  currency: string;
  deposit_policy_type: string;
  deposit_percentage: number | null;
  has_banner: boolean;
  booking_seq: number;
  created_at: string;
}

export interface HotelMember {
  id: string;
  role: "admin" | "general";
  email: string;
  created_at: string;
}

// GET /platform/hotels/:id
export interface PlatformHotelDetail {
  id: string;
  name: string;
  slug: string;
  currency: string;
  deposit_policy_type: string;
  deposit_percentage: number | null;
  booking_seq: number;
  created_at: string;
  users: HotelMember[];
  counts: { rooms: number; reservations: number; guests: number };
}
