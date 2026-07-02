/**
 * One-shot backfill after introducing billing tiers:
 *
 *  1. For every active hardware row, set billingTier from kind:
 *       server / workstation / laptop → full_compute_node
 *       phone / mobile / tablet       → managed_mobile_device
 *       everything else               → not_billable
 *     (skips rows that already have a non-default billingTier set explicitly,
 *     in case anyone has been editing in the UI mid-flight.)
 *
 *  2. For every client with a legacy supportRatePerNodeCents, copy that
 *     value into supportRateFullComputeCents (only if the new field is null,
 *     so we don't clobber any UI-side edits).
 */
import { config as loadEnv } from "dotenv";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../src/db/schema";

loadEnv({ path: ".env.local" });
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const FULL_COMPUTE_KINDS = ["server", "workstation", "laptop"] as const;
const MANAGED_MOBILE_KINDS = ["phone", "mobile", "tablet"] as const;

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });

  // 1. Hardware backfill.
  const fullComputeRows = await db
    .update(schema.hardware)
    .set({ billingTier: "full_compute_node" })
    .where(
      and(
        inArray(schema.hardware.kind, [...FULL_COMPUTE_KINDS]),
        eq(schema.hardware.billingTier, "not_billable"),
      ),
    )
    .returning({ id: schema.hardware.id });
  console.log(`Set full_compute_node on ${fullComputeRows.length} hardware rows.`);

  const mobileRows = await db
    .update(schema.hardware)
    .set({ billingTier: "managed_mobile_device" })
    .where(
      and(
        inArray(schema.hardware.kind, [...MANAGED_MOBILE_KINDS]),
        eq(schema.hardware.billingTier, "not_billable"),
      ),
    )
    .returning({ id: schema.hardware.id });
  console.log(`Set managed_mobile_device on ${mobileRows.length} hardware rows.`);

  // 2. Client rate migration (legacy single rate → full_compute rate).
  const clientsWithOldRate = await db
    .select()
    .from(schema.clients)
    .where(
      and(
        // Only migrate if old field has a value AND new field is null.
        isNull(schema.clients.supportRateFullComputeCents),
      ),
    );
  let migratedClients = 0;
  for (const c of clientsWithOldRate) {
    if (c.supportRatePerNodeCents == null) continue;
    await db
      .update(schema.clients)
      .set({ supportRateFullComputeCents: c.supportRatePerNodeCents })
      .where(eq(schema.clients.id, c.id));
    migratedClients++;
  }
  console.log(`Migrated supportRatePerNodeCents → supportRateFullComputeCents for ${migratedClients} client(s).`);

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
