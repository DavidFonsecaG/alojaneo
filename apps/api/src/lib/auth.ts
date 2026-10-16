import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

export type TokenPayload = {
  userId: string;
  hotelId: string;
  role: string;
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Sessions last 24h, then the user logs in again (with a fresh email code).
export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

// Short-lived, stateless ticket for signup email verification. It carries the
// pending account plus the hashed verification code, so no hotel/user row is
// created until the emailed code is confirmed (no orphan accounts, no email
// squatting). Signed with the server secret, so the client can't forge it.
export type SignupTicketPayload = {
  typ: "signup";
  hotelName: string;
  email: string;
  passwordHash: string;
  codeHash: string;
};

export function signSignupTicket(
  data: Omit<SignupTicketPayload, "typ">,
): string {
  return jwt.sign({ ...data, typ: "signup" }, JWT_SECRET, { expiresIn: "10m" });
}

export function verifySignupTicket(token: string): SignupTicketPayload {
  const payload = jwt.verify(token, JWT_SECRET) as SignupTicketPayload;
  if (payload.typ !== "signup") throw new Error("Not a signup ticket");
  return payload;
}

// Platform owner (cross-hotel developer) sessions — no hotel/role, just the
// user id plus a marker. Also 24h.
export type PlatformTokenPayload = { userId: string; platformOwner: true };

export function signPlatformToken(userId: string): string {
  return jwt.sign({ userId, platformOwner: true }, JWT_SECRET, {
    expiresIn: "24h",
  });
}

export function verifyPlatformToken(token: string): PlatformTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET) as PlatformTokenPayload;
  if (!payload.platformOwner) throw new Error("Not a platform token");
  return payload;
}
