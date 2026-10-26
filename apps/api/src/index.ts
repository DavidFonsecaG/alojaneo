import "./env.js"; // load .env before anything reads process.env
import Fastify from "fastify";
import cors from "@fastify/cors";
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
import { hotelPaymentRoutes } from "./routes/hotelPayments.js";
import { userRoutes } from "./routes/users.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { meRoutes } from "./routes/me.js";
import { publicBookingRoutes } from "./routes/publicBooking.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { platformRoutes } from "./routes/platform.js";

export function buildApp() {
  const app = Fastify({ logger: false });

  // CORS. In production set CORS_ORIGINS to a comma-separated allowlist of the
  // front-end origins (e.g. https://app.alojaneo.com,https://book.alojaneo.com,
  // https://admin.alojaneo.com). The embedded booking engine runs inside an
  // iframe served from book.alojaneo.com, so its API calls carry that origin —
  // the allowlist covers embeds too, no per-hotel-domain entries needed.
  // Unset (local dev, where the Vite proxy makes calls same-origin) → reflect
  // any origin. Server-to-server callers like gateway webhooks send no Origin
  // and are unaffected.
  const corsOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.register(cors, {
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400,
  });

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
    // Log unexpected 500s (stack to the server console); keep the client
    // response generic so internals aren't leaked.
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error("[api] 500:", (err as Error).stack ?? err);
    }
    const message =
      status >= 500 ? "Server error" : ((err as Error).message ?? "Error");
    return reply.code(status).send({ error: message });
  });

  app.get("/health", async () => ({ ok: true }));

  // Public routes (no auth)
  app.register(authRoutes);
  app.register(publicBookingRoutes);
  app.register(webhookRoutes);
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
  app.register(hotelPaymentRoutes);
  app.register(userRoutes);
  app.register(dashboardRoutes);
  app.register(meRoutes);

  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = buildApp();
  app.listen({ port: 3001, host: "0.0.0.0" }).then(() => {
    console.log("API listening on http://localhost:3001");
  });
}
