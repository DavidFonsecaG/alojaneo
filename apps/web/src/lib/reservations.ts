import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./api";
import type {
  ReservationDetail,
  ReservationListItem,
  ReservationNote,
  ReservationRoom,
  ReservationRoomStatus,
  TimelineStay,
} from "../types";

export interface ReservationFilters {
  status?: string;
  from?: string;
  to?: string;
}

export function useReservations(filters: ReservationFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const qs = params.toString();

  return useQuery({
    queryKey: ["reservations", filters],
    queryFn: () =>
      api.get<ReservationListItem[]>(
        `/reservations${qs ? `?${qs}` : ""}`,
      ),
  });
}

// Per-room stays overlapping [from, to) — one row per lane segment for the
// timeline view. Keyed by the window so React Query caches each range and
// paging weeks is instant after the first fetch.
export function useTimeline(from: string, to: string) {
  return useQuery({
    queryKey: ["timeline", from, to],
    queryFn: () =>
      api.get<TimelineStay[]>(
        `/reservations/timeline?from=${from}&to=${to}`,
      ),
    enabled: !!from && !!to,
  });
}

export interface CreateReservationRoom {
  roomId: string;
  ratePlanId?: string;
  rateCents: number;
  checkIn: string;
  checkOut: string;
}

export interface CreateReservationInput {
  guestId: string;
  rooms: CreateReservationRoom[];
  source?: string;
}

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReservationInput) =>
      api.post<{ id: string }>("/reservations", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
  });
}

export function useReservation(id: string | undefined) {
  return useQuery({
    queryKey: ["reservation", id],
    queryFn: () => api.get<ReservationDetail>(`/reservations/${id}`),
    enabled: !!id,
  });
}

export function useUpdateRoomStatus(reservationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      roomId,
      status,
    }: {
      roomId: string;
      status: ReservationRoomStatus;
    }) =>
      api.patch<ReservationRoom>(`/reservation-rooms/${roomId}/status`, {
        status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservation", reservationId] });
      qc.invalidateQueries({ queryKey: ["reservations"] });
    },
  });
}

export function useAddNote(reservationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<ReservationNote>(`/reservations/${reservationId}/notes`, {
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reservation", reservationId] });
    },
  });
}
