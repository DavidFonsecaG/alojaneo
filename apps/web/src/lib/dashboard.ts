import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { toApiDate } from "./format";
import type { DashboardData, OccupancyData, OccupancySpan } from "../types";

// The client's *local* date, so the dashboard's notion of "today" matches the
// timeline and the rest of the app (the server would otherwise use UTC).
const today = () => toApiDate(new Date());

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard", today()],
    queryFn: () => api.get<DashboardData>(`/dashboard?today=${today()}`),
  });
}

export function useOccupancy(span: OccupancySpan) {
  return useQuery({
    queryKey: ["dashboard", "occupancy", span, today()],
    queryFn: () =>
      api.get<OccupancyData>(
        `/dashboard/occupancy?span=${span}&today=${today()}`,
      ),
  });
}
