import { config as loadEnv } from "dotenv";
import { sql } from "drizzle-orm";
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

  const byKind = await db.execute(sql`
    SELECT kind, billing_tier, count(*) as count
    FROM hardware
    GROUP BY kind, billing_tier
    ORDER BY count DESC
  `);
  console.log("kind / billing_tier / count");
  for (const r of byKind.rows) {
    console.log(`  ${String(r.kind).padEnd(20)} ${String(r.billing_tier).padEnd(25)} ${r.count}`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
