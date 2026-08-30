import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const createRoomTypeSchema = z.object({
  name: z.string().min(1),
  maxOccupancy: z.number().int().positive().default(2),
});

export async function roomTypeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/room-types", async (req) => {
    return withTenant(req.hotelId, (tx) =>
      tx`select id, name, max_occupancy, created_at from room_types order by name`,
    );
  });

  app.post("/room-types", async (req, reply) => {
    const body = createRoomTypeSchema.parse(req.body);

    const [roomType] = await withTenant(req.hotelId, (tx) =>
      tx`
        insert into room_types (hotel_id, name, max_occupancy)
        values (${req.hotelId}, ${body.name}, ${body.maxOccupancy})
        returning id, name, max_occupancy, created_at
      `,
    );

    return reply.code(201).send(roomType);
  });
}
