import Fastify from "fastify";
import { ZodError } from "zod";
import { authRoutes } from "./routes/auth.js";
import { roomTypeRoutes } from "./routes/roomTypes.js";
import { roomRoutes } from "./routes/rooms.js";
import { ratePlanRoutes } from "./routes/ratePlans.js";
import { guestRoutes } from "./routes/guests.js";
import { reservationRoutes } from "./routes/reservations.js";
import { paymentRoutes } from "./routes/payments.js";
import { housekeepingRoutes } from "./routes/housekeeping.js";
import { hotelSettingsRoutes } from "./routes/hotelSettings.js";
import { userRoutes } from "./routes/users.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { publicBookingRoutes } from "./routes/publicBooking.js";
import { platformRoutes } from "./routes/platform.js";

export function buildApp() {
  const app = Fastify({ logger: false });

  // Zod validation failures are client errors, not 500s. (Errors that already
  // carry a statusCode — e.g. our 409 conflicts — pass through unchanged.)
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "Validation failed",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    // Surface intentional client-error messages (e.g. 409 conflicts); keep
    // unexpected 500s generic so internals aren't leaked.
    const message = status >= 500 ? "Server error" : (err.message ?? "Error");
    return reply.code(status).send({ error: message });
  });

  app.get("/health", async () => ({ ok: true }));

  // Public routes (no auth)
  app.register(authRoutes);
  app.register(publicBookingRoutes);
  app.register(platformRoutes);

  // Authenticated routes
  app.register(roomTypeRoutes);
  app.register(roomRoutes);
  app.register(ratePlanRoutes);
  app.register(guestRoutes);
  app.register(reservationRoutes);
  app.register(paymentRoutes);
  app.register(housekeepingRoutes);
  app.register(hotelSettingsRoutes);
  app.register(userRoutes);
  app.register(dashboardRoutes);

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = buildApp();
  app.listen({ port: 3001, host: "0.0.0.0" }).then(() => {
    console.log("API listening on http://localhost:3001");
  });
}
