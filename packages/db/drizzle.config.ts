import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "hotel_dev",
    user: process.env.PGUSER ?? "app_user",
    password: process.env.PGPASSWORD ?? "app_user_pw",
  },
});
