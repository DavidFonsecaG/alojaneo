import type { FastifyInstance } from "fastify";
import { getLastDevCode } from "../apps/api/src/mail/index.js";

export interface SignupResult {
  token: string;
  hotel: { id: string; name: string; slug: string };
}

// Signup is a two-step email-verified flow: POST /auth/signup emails a code and
// returns a ticket, then POST /auth/signup/verify confirms the code and creates
// the account. Tests run with the console mailer, so the code is readable via
// getLastDevCode. The slug is derived from the name server-side (no hotelSlug).
export async function signupHotel(
  app: FastifyInstance,
  input: { hotelName: string; email: string; password: string },
): Promise<SignupResult> {
  const start = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: input,
  });
  if (start.statusCode !== 200) {
    throw new Error(`signup start failed (${start.statusCode}): ${start.body}`);
  }
  const { ticket } = JSON.parse(start.body);

  const code = getLastDevCode(input.email);
  if (!code) throw new Error(`no dev signup code for ${input.email}`);

  const verify = await app.inject({
    method: "POST",
    url: "/auth/signup/verify",
    payload: { ticket, code },
  });
  if (verify.statusCode !== 201) {
    throw new Error(`signup verify failed (${verify.statusCode}): ${verify.body}`);
  }
  return JSON.parse(verify.body) as SignupResult;
}
