import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AvailabilityItem,
  BookingConfirmation,
  BookingRequest,
  HotelInfo,
  PaymentConfirmResult,
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

// The up-front deposit for a stay, mirroring the server's computeDepositCents
// so checkout can show what will be charged now before the booking is made.
export function depositCents(
  deposit: { type: string | null; percentage: number | null } | undefined,
  totalCents: number,
): number {
  if (!deposit) return 0;
  if (deposit.type === "full") return totalCents;
  if (deposit.type === "percentage" && deposit.percentage && deposit.percentage > 0) {
    return Math.min(totalCents, Math.round((totalCents * deposit.percentage) / 100));
  }
  return 0;
}

// POST /public/:hotelSlug/bookings
export function useCreateBooking(hotelSlug: string | undefined) {
  return useMutation({
    mutationFn: (body: BookingRequest) =>
      api.post<BookingConfirmation>(`/public/${hotelSlug}/bookings`, body),
  });
}

// POST /public/:hotelSlug/reservations/:id/confirm-payment — finalise a
// gateway payment when the guest returns from the hosted checkout. A plain
// request (not a hook) so the caller can drive it from a one-shot effect.
export function confirmPaymentRequest(
  hotelSlug: string | undefined,
  args: { reservationId: string; clientTxId: string; providerTxId?: string },
) {
  return api.post<PaymentConfirmResult>(
    `/public/${hotelSlug}/reservations/${args.reservationId}/confirm-payment`,
    { clientTxId: args.clientTxId, providerTxId: args.providerTxId },
  );
}
