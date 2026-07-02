import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

neonConfig.fetchConnectionCache = true;

// neon() validates URL format at init but only makes HTTP calls when a
// query runs. Using a placeholder at build time avoids throwing during
// Next.js static analysis; the real URL is always present at runtime.
const url = process.env.DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost/placeholder";

const sql = neon(url);
export const db = drizzle(sql, { schema, logger: process.env.NODE_ENV === "development" });
export type DB = typeof db;
export { schema };
