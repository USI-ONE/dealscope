/**
 * Third-pass backfill: any Syncro-tracked hardware that's still
 * not_billable AND has a serial number → full_compute_node by default.
 *
 * This errs on the side of OVER-classifying so finance has a sane starting
 * count of billable compute nodes. They downgrade kiosks / VMs / mobile
 * devices via the UI per row.
 */
import { config as loadEnv } from "dotenv";
import { and, eq, isNotNull, sql } from "drizzle-orm";
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

  const r = await db
    .update(schema.hardware)
    .set({ billingTier: "full_compute_node" })
    .where(
      and(
        eq(schema.hardware.billingTier, "not_billable"),
        isNotNull(schema.hardware.syncroAssetId),
        isNotNull(schema.hardware.serialNumber),
      ),
    )
    .returning({ id: schema.hardware.id });

  console.log(
    `Defaulted ${r.length} Syncro-tracked-with-serial rows to full_compute_node.`,
  );

  const dist = await db.execute(sql`
    SELECT billing_tier, count(*) as count
    FROM hardware
    GROUP BY billing_tier
    ORDER BY count DESC
  `);
  console.log("\nFinal distribution:");
  for (const row of dist.rows) {
    console.log(`  ${String(row.billing_tier).padEnd(28)} ${row.count}`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
