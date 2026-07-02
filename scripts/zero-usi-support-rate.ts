/**
 * One-off: zero out the Universal Systems Inc. support rates so USI appears
 * in monthly statements at $0 contracted support (managed the same as every
 * other client, just no charge).
 */
import { config as loadEnv } from "dotenv";
import { and, eq, ilike } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../src/db/schema";

loadEnv({ path: ".env.local" });
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });

  const matches = await db
    .select()
    .from(schema.clients)
    .where(ilike(schema.clients.name, "Universal Systems%"));

  if (matches.length === 0) {
    console.log("No Universal Systems client found.");
    await c.end();
    return;
  }

  for (const m of matches) {
    await db
      .update(schema.clients)
      .set({
        supportBaselineCents: 0,
        supportRatePerNodeCents: 0,
        updatedAt: new Date(),
      })
      .where(eq(schema.clients.id, m.id));
    console.log(`Zeroed support rates for: ${m.name} (id=${m.id})`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
