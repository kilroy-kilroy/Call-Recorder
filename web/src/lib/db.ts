import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("Missing DATABASE_URL — database calls will fail at runtime");
}

export const sql = neon(databaseUrl ?? "");
