import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { api } from "./api";
import type {
  DepositPolicyType,
  Guest,
  HotelProfile,
  HotelSettings,
  HotelUser,
  PermissionMatrix,
  RatePlan,
  Role,
  Room,
  RoomType,
  RoomTypePhoto,
} from "../types";

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

// ── Hotel profile + booking-engine branding ─────────────────────────
export function useHotelProfile() {
  return useQuery({
    queryKey: ["hotel-profile"],
    queryFn: () => api.get<HotelProfile>("/hotel/profile"),
  });
}

export interface HotelProfileInput {
  name?: string;
  slug?: string;
  // "" clears the banner / resets the accent to the engine default.
  bannerUrl?: string;
  bannerPosition?: number; // 0–100 (%)
  accentColor?: string;
}

export function useUpdateHotelProfile() {
  return useInvalidatingMutation(
    (input: HotelProfileInput) =>
      api.patch<HotelProfile>("/hotel/profile", input),
    [["hotel-profile"]],
  );
}

// The signed-in user's identity, for the account menu.
export interface Me {
  email: string;
  role: string;
  hotelName: string;
  hotelSlug: string;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/me"),
    staleTime: 5 * 60_000,
  });
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Self-service password change for the signed-in user. Not cached, so it's a
// plain mutation (nothing to invalidate — the session token is unchanged).
export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      api.patch<{ ok: true }>("/me/password", input),
  });
}

// ── Hotel settings (deposit policy, taxes) ──────────────────────────
export function useHotelSettings() {
  return useQuery({
    queryKey: ["hotel-settings"],
    queryFn: () => api.get<HotelSettings>("/hotel/settings"),
  });
}

export interface HotelSettingsInput {
  depositPolicyType?: DepositPolicyType;
  depositPercentage?: number;
}

export function useUpdateHotelSettings() {
  return useInvalidatingMutation(
    (input: HotelSettingsInput) =>
      api.patch<HotelSettings>("/hotel/settings", input),
    [["hotel-settings"]],
  );
}

// ── Payment gateway (per-hotel) ─────────────────────────────────────
// The private key is write-only: the server returns `hasPrivateKey`, never the
// key itself.
export interface HotelPaymentSettings {
  provider: string; // mock | kushki | payphone
  publicKey: string | null;
  enabled: boolean;
  hasPrivateKey: boolean;
  webhookUrl: string | null;
}

export function useHotelPaymentSettings() {
  return useQuery({
    queryKey: ["hotel-payment-settings"],
    queryFn: () => api.get<HotelPaymentSettings>("/hotel/payment-settings"),
  });
}

export interface HotelPaymentSettingsInput {
  provider?: string;
  publicKey?: string | null; // null/"" clears
  privateKey?: string; // write-only; "" clears, omit to keep
  enabled?: boolean;
}

export function useUpdateHotelPaymentSettings() {
  return useInvalidatingMutation(
    (input: HotelPaymentSettingsInput) =>
      api.put<HotelPaymentSettings>("/hotel/payment-settings", input),
    [["hotel-payment-settings"]],
  );
}

// ── Users & permissions ─────────────────────────────────────────────
export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<HotelUser[]>("/users"),
  });
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: Role;
  permissions?: PermissionMatrix;
}

export function useCreateUser() {
  return useInvalidatingMutation(
    (input: CreateUserInput) => api.post<HotelUser>("/users", input),
    [["users"]],
  );
}

export interface UpdateUserInput {
  role?: Role;
  permissions?: PermissionMatrix;
}

export function useUpdateUser() {
  return useInvalidatingMutation(
    ({ id, ...input }: UpdateUserInput & { id: string }) =>
      api.patch<HotelUser>(`/users/${id}`, input),
    [["users"]],
  );
}

export function useDeleteUser() {
  return useInvalidatingMutation(
    (id: string) => api.del<void>(`/users/${id}`),
    [["users"]],
  );
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

export type HousekeepingStatus = "clean" | "dirty" | "in_progress" | "inspected";

export function useUpdateHousekeeping() {
  return useInvalidatingMutation(
    ({ id, status }: { id: string; status: HousekeepingStatus }) =>
      api.patch<Room>(`/rooms/${id}/housekeeping`, { status }),
    [["rooms"], ["dashboard"]],
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
