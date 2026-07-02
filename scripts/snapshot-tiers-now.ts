/**
 * One-time / manual run of the daily tier snapshot, useful right after
 * shipping the high-water-mark feature so the current month has at least
 * one snapshot row per client (otherwise the live-counts fallback is what
 * shows up until the cron fires).
 *
 * Usage:
 *   pnpm tsx scripts/snapshot-tiers-now.ts
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });
  const today = new Date().toISOString().slice(0, 10);

  const orgs = await db.select({ id: schema.organizations.id }).from(schema.organizations);
  for (const org of orgs) {
    const clients = await db
      .select({ id: schema.clients.id, name: schema.clients.name, additionalUserCount: schema.clients.additionalUserCount })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.organizationId, org.id),
          isNull(schema.clients.archivedAt),
        ),
      );
    console.log(`Org ${org.id}: snapshotting ${clients.length} clients for ${today}`);
    for (const client of clients) {
      const hw = await db
        .select({ billingTier: schema.hardware.billingTier })
        .from(schema.hardware)
        .where(
          and(
            eq(schema.hardware.clientId, client.id),
            eq(schema.hardware.organizationId, org.id),
            eq(schema.hardware.status, "active"),
          ),
        );
      const counts = {
        fullCompute: 0,
        kiosk: 0,
        virtualMachine: 0,
        managedMobile: 0,
        notBillable: 0,
      };
      for (const r of hw) {
        switch (r.billingTier) {
          case "full_compute_node": counts.fullCompute++; break;
          case "kiosk_node": counts.kiosk++; break;
          case "virtual_machine_node": counts.virtualMachine++; break;
          case "managed_mobile_device": counts.managedMobile++; break;
          default: counts.notBillable++; break;
        }
      }
      await db
        .insert(schema.clientTierSnapshots)
        .values({
          organizationId: org.id,
          clientId: client.id,
          snapshotDate: today,
          fullCompute: counts.fullCompute,
          kiosk: counts.kiosk,
          virtualMachine: counts.virtualMachine,
          managedMobile: counts.managedMobile,
          notBillable: counts.notBillable,
          additionalUsers: client.additionalUserCount ?? 0,
        })
        .onConflictDoUpdate({
          target: [schema.clientTierSnapshots.clientId, schema.clientTierSnapshots.snapshotDate],
          set: {
            fullCompute: counts.fullCompute,
            kiosk: counts.kiosk,
            virtualMachine: counts.virtualMachine,
            managedMobile: counts.managedMobile,
            notBillable: counts.notBillable,
            additionalUsers: client.additionalUserCount ?? 0,
            updatedAt: new Date(),
          },
        });
      console.log(`  ${client.name.padEnd(40)} FC=${counts.fullCompute} K=${counts.kiosk} VM=${counts.virtualMachine} M=${counts.managedMobile} NB=${counts.notBillable}`);
    }
  }
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
