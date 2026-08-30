import Fastify from "fastify";
import { authRoutes } from "./routes/auth.js";
import { roomTypeRoutes } from "./routes/roomTypes.js";
import { roomRoutes } from "./routes/rooms.js";
import { ratePlanRoutes } from "./routes/ratePlans.js";
import { guestRoutes } from "./routes/guests.js";
import { reservationRoutes } from "./routes/reservations.js";
import { paymentRoutes } from "./routes/payments.js";
import { housekeepingRoutes } from "./routes/housekeeping.js";
import { hotelSettingsRoutes } from "./routes/hotelSettings.js";
import { publicBookingRoutes } from "./routes/publicBooking.js";

export function buildApp() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));

  // Public routes (no auth)
  app.register(authRoutes);
  app.register(publicBookingRoutes);

  // Authenticated routes
  app.register(roomTypeRoutes);
  app.register(roomRoutes);
  app.register(ratePlanRoutes);
  app.register(guestRoutes);
  app.register(reservationRoutes);
  app.register(paymentRoutes);
  app.register(housekeepingRoutes);
  app.register(hotelSettingsRoutes);

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = buildApp();
  app.listen({ port: 3001, host: "0.0.0.0" }).then(() => {
    console.log("API listening on http://localhost:3001");
  });
}
