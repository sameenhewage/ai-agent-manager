import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Server-side PostgreSQL access for the dashboard (Slice 3).
 *
 * - Reads `DATABASE_URL` from the environment ONLY (never hardcoded/committed).
 * - Uses the Node `pg` driver, so this module can never be bundled into a client
 *   component (Next would fail the build) — DB secrets stay server-side.
 * - Connects to the same database that hosts the read-only `ai.*` schema, but
 *   this app only ever reads/writes the `dashboard` schema (see ./schema.ts).
 */

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "DATABASE_URL is not set. Provide it via the environment or a gitignored .env file (never commit it)."
    );
  }
  return url;
}

let pool: Pool | undefined;

/** Lazily create a singleton connection pool (server-side only). */
export function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: requireDatabaseUrl() });
  return pool;
}

/** Drizzle client bound to the dashboard schema. */
export function getDb(): NodePgDatabase<typeof schema> {
  return drizzle(getPool(), { schema });
}

/** Mask credentials + host so connection info can be logged without leaking secrets. */
export function maskDbUrl(
  raw: string | undefined = process.env.DATABASE_URL
): string {
  if (!raw) return "(DATABASE_URL not set)";
  try {
    const u = new URL(raw);
    const cred = u.username ? "***:***@" : "";
    return `${u.protocol}//${cred}***:${u.port || "?"}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}
