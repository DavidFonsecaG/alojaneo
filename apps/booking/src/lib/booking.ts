import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AvailabilityItem,
  BookingConfirmation,
  BookingRequest,
  SearchParams,
} from "../types";

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
