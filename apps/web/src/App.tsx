import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ReservationsPage } from "./pages/ReservationsPage";
import { NewReservationPage } from "./pages/NewReservationPage";
import { ReservationDetailPage } from "./pages/ReservationDetailPage";
import { TimelinePage } from "./pages/TimelinePage";
import { RoomsPage } from "./pages/RoomsPage";
import { RatePlansPage } from "./pages/RatePlansPage";
import { GuestsPage } from "./pages/GuestsPage";
import { SettingsPage } from "./pages/SettingsPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/reservations/new" element={<NewReservationPage />} />
          <Route
            path="/reservations/:id"
            element={<ReservationDetailPage />}
          />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/rate-plans" element={<RatePlansPage />} />
          <Route path="/guests" element={<GuestsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
