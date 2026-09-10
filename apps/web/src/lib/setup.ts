import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { api } from "./api";
import type { Guest, RatePlan, Room, RoomType, RoomTypePhoto } from "../types";

// Small helper: a mutation that invalidates one or more query keys on success.
function useInvalidatingMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  keys: QueryKey[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key });
    },
  });
}

// ── Room types ──────────────────────────────────────────────────────
export function useRoomTypes() {
  return useQuery({
    queryKey: ["room-types"],
    queryFn: () => api.get<RoomType[]>("/room-types"),
  });
}

export interface RoomTypeInput {
  name: string;
  maxOccupancy: number;
  description?: string;
  amenities?: string[];
}

export function useCreateRoomType() {
  return useInvalidatingMutation(
    (input: RoomTypeInput) => api.post<RoomType>("/room-types", input),
    [["room-types"]],
  );
}

export function useUpdateRoomType() {
  return useInvalidatingMutation(
    ({ id, ...input }: RoomTypeInput & { id: string }) =>
      api.put<RoomType>(`/room-types/${id}`, input),
    [["room-types"]],
  );
}

// ── Room-type photos ────────────────────────────────────────────────
export function useRoomTypePhotos(typeId: string | undefined) {
  return useQuery({
    queryKey: ["room-type-photos", typeId],
    queryFn: () =>
      api.get<RoomTypePhoto[]>(`/room-types/${typeId}/photos`),
    enabled: !!typeId,
  });
}

export function useAddRoomTypePhoto(typeId: string) {
  return useInvalidatingMutation(
    (dataUrl: string) =>
      api.post<RoomTypePhoto>(`/room-types/${typeId}/photos`, { dataUrl }),
    [["room-type-photos", typeId]],
  );
}

export function useDeleteRoomTypePhoto(typeId: string) {
  return useInvalidatingMutation(
    (photoId: string) => api.del<void>(`/room-type-photos/${photoId}`),
    [["room-type-photos", typeId]],
  );
}

// ── Rooms ───────────────────────────────────────────────────────────
export function useRooms() {
  return useQuery({
    queryKey: ["rooms"],
    queryFn: () => api.get<Room[]>("/rooms"),
  });
}

export interface RoomInput {
  roomTypeId: string;
  roomNumber: string;
  floor?: number;
  status?: string;
}

export function useCreateRoom() {
  return useInvalidatingMutation(
    (input: RoomInput) => api.post<Room>("/rooms", input),
    [["rooms"]],
  );
}

export function useUpdateRoom() {
  return useInvalidatingMutation(
    ({ id, ...input }: RoomInput & { id: string }) =>
      api.patch<Room>(`/rooms/${id}`, input),
    [["rooms"]],
  );
}

export function useDeleteRoom() {
  return useInvalidatingMutation(
    (id: string) => api.del<void>(`/rooms/${id}`),
    [["rooms"]],
  );
}

// ── Rate plans ──────────────────────────────────────────────────────
export function useRatePlans() {
  return useQuery({
    queryKey: ["rate-plans"],
    queryFn: () => api.get<RatePlan[]>("/rate-plans"),
  });
}

export interface RatePlanInput {
  roomTypeId: string;
  name: string;
  baseRateCents: number;
  currency?: string;
  cancellationPolicy?: string;
  minStay?: number;
  maxStay?: number;
  bookableOnline?: boolean;
  validFrom?: string;
  validTo?: string;
}

export function useCreateRatePlan() {
  return useInvalidatingMutation(
    (input: RatePlanInput) => api.post<RatePlan>("/rate-plans", input),
    [["rate-plans"]],
  );
}

export function useUpdateRatePlan() {
  return useInvalidatingMutation(
    ({ id, ...input }: RatePlanInput & { id: string }) =>
      api.put<RatePlan>(`/rate-plans/${id}`, input),
    [["rate-plans"]],
  );
}

export function useDeleteRatePlan() {
  return useInvalidatingMutation(
    (id: string) => api.del<void>(`/rate-plans/${id}`),
    [["rate-plans"]],
  );
}

// ── Guests ──────────────────────────────────────────────────────────
export function useGuests() {
  return useQuery({
    queryKey: ["guests"],
    queryFn: () => api.get<Guest[]>("/guests"),
  });
}

export function useGuest(id: string | undefined) {
  return useQuery({
    queryKey: ["guest", id],
    queryFn: () => api.get<Guest>(`/guests/${id}`),
    enabled: !!id,
  });
}

export interface GuestInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  documentType?: string;
  documentNumber?: string;
}

export function useCreateGuest() {
  return useInvalidatingMutation(
    (input: GuestInput) => api.post<Guest>("/guests", input),
    [["guests"]],
  );
}

export function useUpdateGuest() {
  return useInvalidatingMutation(
    ({ id, ...input }: GuestInput & { id: string }) =>
      api.put<Guest>(`/guests/${id}`, input),
    // A renamed guest shows up on reservations, the timeline and the
    // dashboard too, so refresh those alongside the guest queries.
    [["guests"], ["guest"], ["reservations"], ["reservation"], ["timeline"], ["dashboard"]],
  );
}

export function useDeleteGuest() {
  return useInvalidatingMutation(
    (id: string) => api.del<void>(`/guests/${id}`),
    [["guests"]],
  );
}
