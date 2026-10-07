import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { PlatformHotel, PlatformHotelDetail } from "../types";

export function useHotels() {
  return useQuery({
    queryKey: ["hotels"],
    queryFn: () => api.get<PlatformHotel[]>("/platform/hotels"),
  });
}

export function useHotel(id: string | undefined) {
  return useQuery({
    queryKey: ["hotel", id],
    queryFn: () => api.get<PlatformHotelDetail>(`/platform/hotels/${id}`),
    enabled: !!id,
  });
}

export interface CreateHotelInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
}

export function useCreateHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateHotelInput) =>
      api.post<PlatformHotel>("/platform/hotels", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotels"] }),
  });
}

export function useDeleteHotel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/platform/hotels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hotels"] }),
  });
}
