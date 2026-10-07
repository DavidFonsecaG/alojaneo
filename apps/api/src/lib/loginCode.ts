import { randomInt } from "node:crypto";
import { sqlUnscoped } from "../db.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { getMailer } from "../mail/index.js";

const CODE_TTL_MINUTES = 10;

// Issue a fresh 6-digit login code for a user: invalidate any prior codes,
// store the new one hashed, and email it. The code only ever leaves via email.
export async function issueLoginCode(
  userId: string,
  email: string,
): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await hashPassword(code);
  await sqlUnscoped`
    update login_codes set consumed_at = now()
    where user_id = ${userId} and consumed_at is null
  `;
  await sqlUnscoped`
    insert into login_codes (user_id, code_hash, expires_at)
    values (${userId}, ${codeHash}, now() + make_interval(mins => ${CODE_TTL_MINUTES}))
  `;
  await getMailer().sendLoginCode(email, code);
}

// Verify (and consume) the most recent valid code for a user.
export async function consumeLoginCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const [row] = await sqlUnscoped`
    select id, code_hash from login_codes
    where user_id = ${userId} and consumed_at is null and expires_at > now()
    order by created_at desc
    limit 1
  `;
  if (!row || !(await verifyPassword(code, row.code_hash))) return false;
  await sqlUnscoped`
    update login_codes set consumed_at = now() where id = ${row.id}
  `;
  return true;
}
