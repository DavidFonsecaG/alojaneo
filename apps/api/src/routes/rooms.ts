import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const createRoomSchema = z.object({
  roomTypeId: z.string().uuid(),
  roomNumber: z.string().min(1),
  floor: z.number().int().optional(),
  status: z.string().optional(),
});

const updateRoomSchema = z
  .object({
    roomNumber: z.string().min(1).optional(),
    floor: z.number().int().optional(),
    roomTypeId: z.string().uuid().optional(),
    status: z.string().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

export async function roomRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/rooms", async (req, reply) => {
    const body = createRoomSchema.parse(req.body);

    const [room] = await withTenant(req.hotelId, (tx) =>
      tx`
        insert into rooms (hotel_id, room_type_id, room_number, floor${body.status ? tx`, status` : tx``})
        values (${req.hotelId}, ${body.roomTypeId}, ${body.roomNumber}, ${body.floor ?? null}${body.status ? tx`, ${body.status}` : tx``})
        returning *
      `,
    );

    return reply.code(201).send(room);
  });

  app.get("/rooms", async (req) => {
    return withTenant(req.hotelId, (tx) =>
      tx`
        select r.*, rt.name as room_type_name
        from rooms r
        join room_types rt on rt.id = r.room_type_id
        order by r.room_number
      `,
    );
  });

  app.get<{ Params: { id: string } }>("/rooms/:id", async (req, reply) => {
    const [room] = await withTenant(req.hotelId, (tx) =>
      tx`select * from rooms where id = ${req.params.id}`,
    );

    if (!room) {
      return reply.code(404).send({ error: "Room not found" });
    }

    return room;
  });

  app.patch<{ Params: { id: string } }>("/rooms/:id", async (req, reply) => {
    const body = updateRoomSchema.parse(req.body);

    const [updated] = await withTenant(req.hotelId, (tx) =>
      tx`update rooms set
        room_number = coalesce(${body.roomNumber ?? null}, room_number),
        floor = coalesce(${body.floor ?? null}, floor),
        room_type_id = coalesce(${body.roomTypeId ?? null}, room_type_id),
        status = coalesce(${body.status ?? null}, status)
        where id = ${req.params.id}
        returning *`,
    );

    if (!updated) {
      return reply.code(404).send({ error: "Room not found" });
    }

    return updated;
  });

  app.delete<{ Params: { id: string } }>("/rooms/:id", async (req, reply) => {
    const [deleted] = await withTenant(req.hotelId, (tx) =>
      tx`delete from rooms where id = ${req.params.id} returning id`,
    );

    if (!deleted) {
      return reply.code(404).send({ error: "Room not found" });
    }

    return reply.code(204).send();
  });
}
