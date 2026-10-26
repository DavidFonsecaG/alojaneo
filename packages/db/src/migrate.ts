import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

// Runs the hand-written SQL migrations — the authoritative schema + RLS, which
// drizzle-kit doesn't manage — in filename order, recording each in a
// `_migrations` table so re-runs only apply what's new.
//
// Intended for a FRESH database (a new deploy). The migrations create roles,
// tables and RLS policies; most guard with IF NOT EXISTS, but policies don't,
// so running against a database that was already set up out-of-band will error
// on the first existing policy. A fresh DB applies cleanly end to end.
//
// Connection (first match wins):
//   pnpm --filter @alojaneo/db migrate "<connection string>"   # e.g. Render external URL
//   DATABASE_URL=... pnpm --filter @alojaneo/db migrate
//   pnpm --filter @alojaneo/db migrate                         # PG* env vars (local)
//
// Run as the database OWNER (it needs to create roles/tables), not app_user.
//   --list                  print the migrations in order and exit (no connection)
//   APP_USER_PASSWORD=...    after migrating, set app_user's password (production)

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const connArg = args.find((a) => !a.startsWith("--")) || process.env.DATABASE_URL;

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
const files = readdirSync(dir)
  .filter((f) => /^\d+.*\.sql$/.test(f))
  .sort();

if (listOnly) {
  console.log(`${files.length} migration(s) in order:`);
  for (const f of files) console.log(`  ${f}`);
  process.exit(0);
}

// A connection string (Render/Neon/etc.) is external, so require TLS; PG* env
// is local/internal unless PGSSLMODE says otherwise.
const sql = connArg
  ? postgres(connArg, { max: 1, ssl: "require", onnotice: () => {} })
  : postgres({
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "hotel_dev",
      username: process.env.PGUSER ?? "app_user",
      password: process.env.PGPASSWORD ?? "app_user_pw",
      max: 1,
      ssl: process.env.PGSSLMODE === "require" ? "require" : undefined,
      onnotice: () => {},
    });

async function main() {
  await sql`create table if not exists _migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  )`;
  const done = new Set(
    (await sql`select id from _migrations`).map((r) => r.id as string),
  );

  let applied = 0;
  for (const file of files) {
    if (done.has(file)) {
      console.log(`· ${file} (already applied)`);
      continue;
    }
    process.stdout.write(`→ ${file} … `);
    await sql.unsafe(readFileSync(join(dir, file), "utf8"));
    await sql`insert into _migrations (id) values (${file})`;
    applied++;
    console.log("ok");
  }

  console.log(
    applied > 0
      ? `\nApplied ${applied} migration(s).`
      : "\nUp to date — nothing to apply.",
  );

  // 0001 creates app_user with a dev password. In production set a strong one by
  // passing APP_USER_PASSWORD — folded in here so no separate psql step is
  // needed. ALTER ROLE takes a string literal (not a bind param), so the value
  // is quoted/escaped; use a generated token (no exotic characters).
  const appPw = process.env.APP_USER_PASSWORD;
  if (appPw) {
    const literal = "'" + appPw.replace(/'/g, "''") + "'";
    await sql.unsafe(`alter role app_user password ${literal}`);
    console.log("Set app_user password from APP_USER_PASSWORD.");
  }

  await sql.end();
}

main().catch(async (err) => {
  console.error("\nMigration failed:", err instanceof Error ? err.message : err);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
});
