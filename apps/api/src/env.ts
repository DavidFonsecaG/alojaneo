import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the repo-root .env into process.env for local/dev runs, so config such
// as RESEND_API_KEY / MAIL_FROM, the PG* connection settings and JWT_SECRET
// take effect without a process manager. Dependency-free (no dotenv). Imported
// first in index.ts, before any module that reads process.env at load time.
//
// Skipped under tests (which rely on the defaults baked into db.ts), and any
// variable already present in the real environment wins over the file.
if (process.env.NODE_ENV !== "test") {
  try {
    const here = dirname(fileURLToPath(import.meta.url)); // apps/api/src
    const envPath = resolve(here, "../../../.env"); // repo root
    for (const raw of readFileSync(envPath, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // No .env file (e.g. production sets real env vars directly) — that's fine.
  }
}
