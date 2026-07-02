/**
 * Manual trigger of today's heartbeat capture (what the daily cron does).
 * Useful for kicking off coverage on Day 1 so we don't have to wait for
 * 02:00 UTC. Also re-runnable to catch up if the cron missed a day.
 *
 *   pnpm exec tsx scripts/capture-heartbeats-now.ts
 *
 * Logic mirrors src/lib/billing/heartbeats.ts — duplicated here because
 * that module is "server-only" (won't import under tsx).
 */
import { config as loadEnv } from "dotenv";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  isSyncroConfigured,
  listAssetsForCustomer,
  type SyncroAsset,
} from "../src/lib/syncro";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const HEARTBEAT_WINDOW_HOURS = 36;

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
if (!isSyncroConfigured()) {
  console.error("Syncro not configured (SYNCRO_SUBDOMAIN + SYNCRO_API_KEY).");
}

function withinWindow(updatedAt: string | undefined, now: Date): boolean {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= HEARTBEAT_WINDOW_HOURS * 60 * 60 * 1000;
}

async function main() {
  const c = new Client({ connectionString: url });
  await c.connect();
  const db = drizzle(c, { schema });
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const orgs = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations);

  for (const org of orgs) {
    console.log(`\nOrg ${org.id} — capturing heartbeats for ${today}`);
    const clients = await db
      .select({
        id: schema.clients.id,
        name: schema.clients.name,
        syncroCustomerId: schema.clients.syncroCustomerId,
      })
      .from(schema.clients)
      .where(
        and(
          eq(schema.clients.organizationId, org.id),
          isNull(schema.clients.archivedAt),
        ),
      );

    let totalSyncro = 0;
    let totalManual = 0;
    let totalStale = 0;
    let totalErr = 0;

    for (const client of clients) {
      const allActive = await db
        .select({
          id: schema.hardware.id,
          syncroAssetId: schema.hardware.syncroAssetId,
          billingTier: schema.hardware.billingTier,
          notOnContract: schema.hardware.notOnContract,
        })
        .from(schema.hardware)
        .where(
          and(
            eq(schema.hardware.organizationId, org.id),
            eq(schema.hardware.clientId, client.id),
            eq(schema.hardware.status, "active"),
          ),
        );

      const bySyncroId = new Map<string, (typeof allActive)[number]>();
      const manualRows: typeof allActive = [];
      for (const h of allActive) {
        // Honour Syncro's "Not on Contract" flag — don't record a
        // billable heartbeat for these even when they check in.
        if (h.notOnContract === "1") continue;
        if (h.syncroAssetId) bySyncroId.set(h.syncroAssetId, h);
        else manualRows.push(h);
      }

      let inserted = 0;
      let manualCount = 0;
      let stale = 0;
      const errs: string[] = [];

      if (client.syncroCustomerId && isSyncroConfigured()) {
        const cid = parseInt(client.syncroCustomerId, 10);
        if (!Number.isNaN(cid)) {
          let assets: SyncroAsset[] = [];
          try {
            assets = await listAssetsForCustomer(cid);
          } catch (e) {
            errs.push(`Syncro pull failed: ${(e as Error).message}`);
          }
          for (const a of assets) {
            const hw = bySyncroId.get(String(a.id));
            if (!hw) continue;
            if (!withinWindow(a.updated_at, now)) {
              stale++;
              continue;
            }
            try {
              await db
                .insert(schema.hardwareHeartbeats)
                .values({
                  organizationId: org.id,
                  clientId: client.id,
                  hardwareId: hw.id,
                  heartbeatDate: today,
                  billingTier: hw.billingTier,
                  source: "syncro",
                })
                .onConflictDoUpdate({
                  target: [
                    schema.hardwareHeartbeats.hardwareId,
                    schema.hardwareHeartbeats.heartbeatDate,
                  ],
                  set: {
                    billingTier: hw.billingTier,
                    source: "syncro",
                    updatedAt: new Date(),
                  },
                });
              inserted++;
            } catch (e) {
              errs.push(`hw ${hw.id}: ${(e as Error).message}`);
            }
          }
        }
      }

      for (const h of manualRows) {
        try {
          await db
            .insert(schema.hardwareHeartbeats)
            .values({
              organizationId: org.id,
              clientId: client.id,
              hardwareId: h.id,
              heartbeatDate: today,
              billingTier: h.billingTier,
              source: "manual",
            })
            .onConflictDoUpdate({
              target: [
                schema.hardwareHeartbeats.hardwareId,
                schema.hardwareHeartbeats.heartbeatDate,
              ],
              set: {
                billingTier: h.billingTier,
                source: "manual",
                updatedAt: new Date(),
              },
            });
          manualCount++;
        } catch (e) {
          errs.push(`manual hw ${h.id}: ${(e as Error).message}`);
        }
      }

      totalSyncro += inserted;
      totalManual += manualCount;
      totalStale += stale;
      totalErr += errs.length;
      if (inserted + manualCount + stale > 0) {
        console.log(
          `  ${client.name.padEnd(38)} syncro=${inserted}  manual=${manualCount}  stale=${stale}` +
            (errs.length > 0 ? `  errors=${errs.length}` : ""),
        );
      }
    }

    console.log(
      `\nTotals — syncro=${totalSyncro}  manual=${totalManual}  stale=${totalStale}  errors=${totalErr}`,
    );
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
