import { defineConfig } from "drizzle-kit";

/**
 * Drizzle config.
 *
 * Slice 2 generated the migration offline (no credentials). Slice 3 (Gate 2
 * approved) enables APPLY: `drizzle-kit migrate` reads `dbCredentials.url` from
 * `DATABASE_URL` (env or a gitignored .env) — never hardcoded or committed. Only
 * `generate` and `migrate` are used; `push` (live schema diffing) is intentionally
 * never invoked.
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* no .env file — rely on exported environment variables */
  }
}
loadDotEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["dashboard"],
  strict: true,
  verbose: true,
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
