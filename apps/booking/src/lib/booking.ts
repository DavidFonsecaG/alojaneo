import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AvailabilityItem,
  BookingConfirmation,
  BookingRequest,
  HotelInfo,
  SearchParams,
} from "../types";

// GET /public/:hotelSlug — hotel name, currency and branding. Cached longer
// than availability since it rarely changes within a session.
export function useHotel(hotelSlug: string | undefined) {
  return useQuery({
    queryKey: ["hotel", hotelSlug],
    queryFn: () => api.get<HotelInfo>(`/public/${hotelSlug}`),
    enabled: !!hotelSlug,
    staleTime: 5 * 60_000,
  });
}

// GET /public/:hotelSlug/availability — enabled only once a search has been
// submitted (all three params present).
export function useAvailability(
  hotelSlug: string | undefined,
  params: SearchParams | null,
) {
  return useQuery({
    queryKey: ["availability", hotelSlug, params],
    queryFn: () => {
      const q = new URLSearchParams({
        checkIn: params!.checkIn,
        checkOut: params!.checkOut,
        guests: String(params!.guests),
      });
      return api.get<AvailabilityItem[]>(
        `/public/${hotelSlug}/availability?${q.toString()}`,
      );
    },
    enabled: !!hotelSlug && !!params,
  });
}

// POST /public/:hotelSlug/bookings
export function useCreateBooking(hotelSlug: string | undefined) {
  return useMutation({
    mutationFn: (body: BookingRequest) =>
      api.post<BookingConfirmation>(`/public/${hotelSlug}/bookings`, body),
  });
}
