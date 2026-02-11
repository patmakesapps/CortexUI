import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __cortexPool: Pool | undefined;
}

export function getDbPool(): Pool {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL is required for Cortex memory provider.");
  }

  if (!global.__cortexPool) {
    global.__cortexPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }

  return global.__cortexPool;
}
