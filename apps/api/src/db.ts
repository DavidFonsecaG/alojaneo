import postgres from "postgres";

// Connects as app_user (not the superuser) so that RLS policies actually
// apply — see migrations/0001_init.sql for why that matters.
const sql = postgres({
  host: process.env.PGHOST ?? "localhost",
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? "hotel_dev",
  username: process.env.PGUSER ?? "app_user",
  password: process.env.PGPASSWORD ?? "app_user_pw",
  max: 10, // a real connection pool — this is the part that needed proving
});

/**
 * Runs `fn` with the Postgres session's tenant context set to `hotelId`,
 * inside a transaction.
 *
 * The critical detail: this uses `SET LOCAL`, not `SET`. `SET` changes the
 * setting for the lifetime of the underlying connection — and since `sql`
 * is a pool, that connection gets reused for a *different* request later,
 * which would silently leak hotel A's tenant context into hotel B's query.
 * `SET LOCAL` only applies within the current transaction and is
 * automatically reset when the transaction ends, which is exactly the
 * lifetime we want: one request, one transaction, one tenant context,
 * then the connection goes back to the pool clean.
 *
 * Every tenant-scoped database access in the API must go through this
 * function. A query run outside of it has no tenant context set, which —
 * per the RLS policies — means it sees zero rows rather than all rows.
 * That's a deliberate fail-closed default, not a bug.
 */
export async function withTenant<T>(
  hotelId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.current_hotel_id', ${hotelId}, true)`;
    return fn(tx);
  });
}

/**
 * For queries that are genuinely not tenant-scoped: looking up a user by
 * email at login, before we know which hotel they're logging into.
 * Deliberately separate from withTenant so it's never reached for by
 * accident — anything touching room_types, reservations, etc. must use
 * withTenant instead.
 */
export const sqlUnscoped = sql;

/**
 * Sets app.current_user_id (not app.current_hotel_id) for the one query
 * in the system that's allowed to run before tenant context exists: a
 * user looking up their own hotel_users membership row(s) at login. See
 * the hotel_users_self_lookup policy in 0001_init.sql — it only ever
 * matches the caller's own user_id, never grants broader access.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}
