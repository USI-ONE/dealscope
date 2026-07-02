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

  // Distribution: which fields are populated for kind=other rows?
  const summary = await db.execute(sql`
    SELECT
      count(*) as total,
      count(os_name) as with_os,
      count(rmm_agent) as with_rmm,
      count(serial_number) as with_serial,
      count(last_seen_at) as with_last_seen,
      count(last_ip) as with_last_ip,
      count(assigned_to_label) as with_assigned,
      count(syncro_asset_id) as with_syncro_id
    FROM hardware
    WHERE kind = 'other'
  `);
  console.log("Field population for kind=other:");
  console.log(summary.rows[0]);

  // Show 5 sample rows.
  const samples = await db.execute(sql`
    SELECT label, os_name, manufacturer, model, serial_number, syncro_asset_id, last_ip, rmm_agent, assigned_to_label
    FROM hardware
    WHERE kind = 'other'
    LIMIT 8
  `);
  console.log("\nSample rows:");
  for (const r of samples.rows) {
    console.log(JSON.stringify(r, null, 2));
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
