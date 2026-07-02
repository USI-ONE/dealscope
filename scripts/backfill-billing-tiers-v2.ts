/**
 * Second-pass backfill: for hardware where kind='other' but the row clearly
 * looks like a full computer (Windows/Mac/Linux OS reported by an RMM agent),
 * upgrade billingTier to full_compute_node. Anything still ambiguous remains
 * not_billable and the user can reclassify case-by-case.
 */
import { config as loadEnv } from "dotenv";
import { and, eq, ilike, or, sql } from "drizzle-orm";
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

  // Anything kind=other with a desktop-OS string AND currently not_billable
  // → upgrade to full_compute_node.
  const r = await db
    .update(schema.hardware)
    .set({ billingTier: "full_compute_node" })
    .where(
      and(
        eq(schema.hardware.kind, "other"),
        eq(schema.hardware.billingTier, "not_billable"),
        or(
          ilike(schema.hardware.osName, "Windows%"),
          ilike(schema.hardware.osName, "macOS%"),
          ilike(schema.hardware.osName, "Mac OS%"),
          ilike(schema.hardware.osName, "OS X%"),
          ilike(schema.hardware.osName, "Linux%"),
          ilike(schema.hardware.osName, "Ubuntu%"),
          ilike(schema.hardware.osName, "Debian%"),
          ilike(schema.hardware.osName, "Red Hat%"),
          ilike(schema.hardware.osName, "CentOS%"),
        ),
      ),
    )
    .returning({ id: schema.hardware.id });
  console.log(`Upgraded ${r.length} kind=other rows with desktop OS to full_compute_node.`);

  // Print final distribution.
  const dist = await db.execute(sql`
    SELECT kind, billing_tier, count(*) as count
    FROM hardware
    GROUP BY kind, billing_tier
    ORDER BY count DESC
  `);
  console.log("\nFinal distribution:");
  for (const row of dist.rows) {
    console.log(
      `  ${String(row.kind).padEnd(15)} ${String(row.billing_tier).padEnd(25)} ${row.count}`,
    );
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
