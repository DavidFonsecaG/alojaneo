import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const housekeepingStatusEnum = z.enum([
  "clean",
  "dirty",
  "in_progress",
  "inspected",
]);

const updateRoomHousekeepingSchema = z.object({
  status: housekeepingStatusEnum,
});

const createTaskSchema = z.object({
  roomId: z.string().uuid(),
  taskType: z.enum([
    "checkout_clean",
    "stayover_clean",
    "deep_clean",
    "inspection",
  ]),
  assignedTo: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const updateTaskSchema = z
  .object({
    status: z.enum(["pending", "in_progress", "completed"]).optional(),
    notes: z.string().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

export async function housekeepingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // GET /housekeeping — dashboard view of all rooms with housekeeping status
  app.get("/housekeeping", async (req) => {
    const { status } = req.query as { status?: string };

    return withTenant(req.hotelId, (tx) => {
      const conditions = [tx`1 = 1`];

      if (status) {
        conditions.push(tx`r.housekeeping_status = ${status}`);
      }

      const where = conditions.reduce(
        (acc, cond) => tx`${acc} and ${cond}`,
      );

      return tx`
        select r.*, rt.name as room_type_name
        from rooms r
        join room_types rt on rt.id = r.room_type_id
        where ${where}
        order by r.room_number
      `;
    });
  });

  // PATCH /rooms/:id/housekeeping — update a room's housekeeping status
  app.patch<{ Params: { id: string } }>(
    "/rooms/:id/housekeeping",
    async (req, reply) => {
      const body = updateRoomHousekeepingSchema.parse(req.body);

      const [updated] = await withTenant(req.hotelId, (tx) =>
        tx`
          update rooms
          set housekeeping_status = ${body.status}
          where id = ${req.params.id}
          returning *
        `,
      );

      if (!updated) {
        return reply.code(404).send({ error: "Room not found" });
      }

      return updated;
    },
  );

  // POST /housekeeping/tasks — create a housekeeping task
  app.post("/housekeeping/tasks", async (req, reply) => {
    const body = createTaskSchema.parse(req.body);

    const result = await withTenant(req.hotelId, async (tx) => {
      const [task] = await tx`
        insert into housekeeping_tasks (hotel_id, room_id, assigned_to, task_type, status, notes)
        values (${req.hotelId}, ${body.roomId}, ${body.assignedTo ?? null}, ${body.taskType}, 'pending', ${body.notes ?? null})
        returning *
      `;

      // Set room to 'in_progress' if this is a cleaning task
      if (body.taskType !== "inspection") {
        await tx`
          update rooms
          set housekeeping_status = 'in_progress'
          where id = ${body.roomId}
        `;
      }

      return task;
    });

    return reply.code(201).send(result);
  });

  // GET /housekeeping/tasks — list tasks with optional filters
  app.get("/housekeeping/tasks", async (req) => {
    const { status, roomId } = req.query as {
      status?: string;
      roomId?: string;
    };

    return withTenant(req.hotelId, (tx) => {
      const conditions = [tx`1 = 1`];

      if (status) {
        conditions.push(tx`ht.status = ${status}`);
      }
      if (roomId) {
        conditions.push(tx`ht.room_id = ${roomId}`);
      }

      const where = conditions.reduce(
        (acc, cond) => tx`${acc} and ${cond}`,
      );

      return tx`
        select ht.*, r.room_number
        from housekeeping_tasks ht
        join rooms r on r.id = ht.room_id
        where ${where}
        order by ht.created_at desc
      `;
    });
  });

  // PATCH /housekeeping/tasks/:id — update a task
  app.patch<{ Params: { id: string } }>(
    "/housekeeping/tasks/:id",
    async (req, reply) => {
      const body = updateTaskSchema.parse(req.body);

      const result = await withTenant(req.hotelId, async (tx) => {
        // Fetch existing task first
        const [existing] = await tx`
          select * from housekeeping_tasks where id = ${req.params.id}
        `;

        if (!existing) return null;

        const isCompleting = body.status === "completed";

        const [updated] = await tx`
          update housekeeping_tasks set
            status = coalesce(${body.status ?? null}, status),
            notes = coalesce(${body.notes ?? null}, notes),
            completed_at = ${isCompleting ? tx`now()` : tx`completed_at`}
          where id = ${req.params.id}
          returning *
        `;

        // If completing, update the room's housekeeping status
        if (isCompleting) {
          const newRoomStatus =
            existing.task_type === "inspection" ? "inspected" : "clean";

          await tx`
            update rooms
            set housekeeping_status = ${newRoomStatus}
            where id = ${existing.room_id}
          `;
        }

        return updated;
      });

      if (!result) {
        return reply.code(404).send({ error: "Task not found" });
      }

      return result;
    },
  );
}
