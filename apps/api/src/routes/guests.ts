import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const createGuestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
});

const updateGuestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
});

export async function guestRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  app.post("/guests", async (req, reply) => {
    const body = createGuestSchema.parse(req.body);

    const [guest] = await withTenant(req.hotelId, (tx) =>
      tx`
        insert into guests (hotel_id, first_name, last_name, email, phone, document_type, document_number)
        values (${req.hotelId}, ${body.firstName}, ${body.lastName}, ${body.email ?? null}, ${body.phone ?? null}, ${body.documentType ?? null}, ${body.documentNumber ?? null})
        returning id, first_name, last_name, email, phone, document_type, document_number, created_at
      `,
    );

    return reply.code(201).send(guest);
  });

  app.get("/guests", async (req) => {
    return withTenant(req.hotelId, (tx) =>
      tx`select id, first_name, last_name, email, phone, document_type, document_number, created_at from guests order by last_name, first_name`,
    );
  });

  app.get("/guests/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const [guest] = await withTenant(req.hotelId, (tx) =>
      tx`select id, first_name, last_name, email, phone, document_type, document_number, created_at from guests where id = ${id}`,
    );

    if (!guest) {
      return reply.code(404).send({ error: "Guest not found" });
    }

    return guest;
  });

  app.put("/guests/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateGuestSchema.parse(req.body);

    const [guest] = await withTenant(req.hotelId, (tx) =>
      tx`
        update guests
        set first_name = ${body.firstName},
            last_name = ${body.lastName},
            email = ${body.email ?? null},
            phone = ${body.phone ?? null},
            document_type = ${body.documentType ?? null},
            document_number = ${body.documentNumber ?? null}
        where id = ${id}
        returning id, first_name, last_name, email, phone, document_type, document_number, created_at
      `,
    );

    if (!guest) {
      return reply.code(404).send({ error: "Guest not found" });
    }

    return guest;
  });

  app.delete("/guests/:id", async (req, reply) => {
    const { id } = req.params as { id: string };

    const result = await withTenant(req.hotelId, (tx) =>
      tx`delete from guests where id = ${id} returning id`,
    );

    if (result.length === 0) {
      return reply.code(404).send({ error: "Guest not found" });
    }

    return reply.code(204).send();
  });
}
