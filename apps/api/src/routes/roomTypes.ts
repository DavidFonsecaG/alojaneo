import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const roomTypeBodySchema = z.object({
  name: z.string().min(1),
  maxOccupancy: z.number().int().positive().default(2),
  description: z.string().optional(),
  amenities: z.array(z.string()).default([]),
});

// Base64 data URL. MVP stores the image inline; see 0006_room_type_media.sql
// for the production object-storage TODO.
const photoBodySchema = z.object({
  dataUrl: z.string().min(1).max(12_000_000),
});

// Photos are base64 data URLs, so a single upload can be several MB — well past
// Fastify's 1MB default body limit.
const PHOTO_BODY_LIMIT = 12 * 1024 * 1024;

export async function roomTypeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.get("/room-types", async (req) => {
    return withTenant(req.hotelId, (tx) =>
      tx`select id, name, max_occupancy, description, amenities, created_at
         from room_types order by name`,
    );
  });

  app.post("/room-types", async (req, reply) => {
    const body = roomTypeBodySchema.parse(req.body);

    const [roomType] = await withTenant(req.hotelId, (tx) =>
      tx`
        insert into room_types (hotel_id, name, max_occupancy, description, amenities)
        values (${req.hotelId}, ${body.name}, ${body.maxOccupancy},
                ${body.description ?? null}, ${JSON.stringify(body.amenities)}::jsonb)
        returning id, name, max_occupancy, description, amenities, created_at
      `,
    );

    return reply.code(201).send(roomType);
  });

  app.put("/room-types/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = roomTypeBodySchema.parse(req.body);

    const [roomType] = await withTenant(req.hotelId, (tx) =>
      tx`
        update room_types set
          name = ${body.name},
          max_occupancy = ${body.maxOccupancy},
          description = ${body.description ?? null},
          amenities = ${JSON.stringify(body.amenities)}::jsonb
        where id = ${id}
        returning id, name, max_occupancy, description, amenities, created_at
      `,
    );

    if (!roomType) return reply.code(404).send({ error: "Room type not found" });
    return roomType;
  });

  // ── Photos ─────────────────────────────────────────────────────────
  app.get("/room-types/:id/photos", async (req) => {
    const { id } = req.params as { id: string };
    return withTenant(req.hotelId, (tx) =>
      tx`select id, data_url, sort_order
         from room_type_photos
         where room_type_id = ${id}
         order by sort_order, created_at`,
    );
  });

  app.post(
    "/room-types/:id/photos",
    { bodyLimit: PHOTO_BODY_LIMIT },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = photoBodySchema.parse(req.body);

      const photo = await withTenant(req.hotelId, async (tx) => {
        // RLS makes another hotel's room type invisible → this guards against
        // attaching a photo to a type outside the tenant.
        const [type] = await tx`select id from room_types where id = ${id}`;
        if (!type) return null;
        const [row] = await tx`
          insert into room_type_photos (hotel_id, room_type_id, data_url, sort_order)
          values (
            ${req.hotelId}, ${id}, ${body.dataUrl},
            (select coalesce(max(sort_order) + 1, 0) from room_type_photos where room_type_id = ${id})
          )
          returning id, data_url, sort_order
        `;
        return row;
      });

      if (!photo) return reply.code(404).send({ error: "Room type not found" });
      return reply.code(201).send(photo);
    },
  );

  app.delete("/room-type-photos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await withTenant(req.hotelId, (tx) =>
      tx`delete from room_type_photos where id = ${id} returning id`,
    );
    if (rows.length === 0)
      return reply.code(404).send({ error: "Photo not found" });
    return reply.code(204).send();
  });
}
