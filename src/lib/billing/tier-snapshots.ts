/**
 * Hardware tier snapshot helpers.
 *
 * For monthly billing we bill the HIGH-WATER MARK: the maximum active
 * compute-node count per tier observed during the billing month. A client
 * that briefly held 50 Full Compute nodes mid-month still gets billed for
 * 50 even if they're sitting at 45 by month-end.
 *
 * To make this work the cron at /api/cron/snapshot-tiers writes a
 * (client, date, tier_counts) row every day. `getMonthlyHighWaterMarks()`
 * does a `max()` aggregation over the snapshots for the requested
 * (client, month) and falls back to the live count if no snapshots exist
 * yet (e.g. brand-new clients before the next cron tick).
 */
import "server-only";
import { and, eq, gte, isNull, lte, max, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  clientTierSnapshots,
  clients,
  hardware,
} from "@/db/schema";

export type TierCounts = {
  fullCompute: number;
  kiosk: number;
  virtualMachine: number;
  managedMobile: number;
  notBillable: number;
  additionalUsers: number;
};

/**
 * Compute the current active-hardware tier counts + additional-user count
 * for a single client, in real time.
 */
export async function liveTierCounts(
  organizationId: string,
  clientId: string,
): Promise<TierCounts> {
  const [client, hwRows] = await Promise.all([
    db.query.clients.findFirst({
      where: and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)),
      columns: { additionalUserCount: true },
    }),
    db
      .select({
        billingTier: hardware.billingTier,
      })
      .from(hardware)
      .where(
        and(
          eq(hardware.clientId, clientId),
          eq(hardware.organizationId, organizationId),
          eq(hardware.status, "active"),
          // Exclude devices flagged "Not on Contract" in Syncro from
          // every billable count. A device can be active in TechOS for
          // operational visibility but explicitly excluded from billing.
          or(ne(hardware.notOnContract, "1"), isNull(hardware.notOnContract)),
        ),
      ),
  ]);
  const counts: TierCounts = {
    fullCompute: 0,
    kiosk: 0,
    virtualMachine: 0,
    managedMobile: 0,
    notBillable: 0,
    additionalUsers: client?.additionalUserCount ?? 0,
  };
  for (const r of hwRows) {
    switch (r.billingTier) {
      case "full_compute_node":
        counts.fullCompute += 1;
        break;
      case "kiosk_node":
        counts.kiosk += 1;
        break;
      case "virtual_machine_node":
        counts.virtualMachine += 1;
        break;
      case "managed_mobile_device":
        counts.managedMobile += 1;
        break;
      case "not_billable":
      default:
        counts.notBillable += 1;
        break;
    }
  }
  return counts;
}

/**
 * Capture a snapshot for one client at the given date. Idempotent on the
 * (client_id, snapshot_date) unique index — if a row already exists for
 * that day, we update it with the latest counts. This keeps the cron
 * safe to re-run, and makes hardware mutations free to call this any
 * time we want today's snapshot to reflect a change immediately.
 */
export async function snapshotClientTiers(
  organizationId: string,
  clientId: string,
  date: string,
): Promise<TierCounts> {
  const counts = await liveTierCounts(organizationId, clientId);
  await db
    .insert(clientTierSnapshots)
    .values({
      organizationId,
      clientId,
      snapshotDate: date,
      fullCompute: counts.fullCompute,
      kiosk: counts.kiosk,
      virtualMachine: counts.virtualMachine,
      managedMobile: counts.managedMobile,
      notBillable: counts.notBillable,
      additionalUsers: counts.additionalUsers,
    })
    .onConflictDoUpdate({
      target: [clientTierSnapshots.clientId, clientTierSnapshots.snapshotDate],
      set: {
        fullCompute: counts.fullCompute,
        kiosk: counts.kiosk,
        virtualMachine: counts.virtualMachine,
        managedMobile: counts.managedMobile,
        notBillable: counts.notBillable,
        additionalUsers: counts.additionalUsers,
        updatedAt: new Date(),
      },
    });
  return counts;
}

/**
 * Capture snapshots for every active client in the org. Returns the
 * number of snapshots written. Used by the daily cron and by the
 * one-time backfill helper.
 */
export async function snapshotAllClients(
  organizationId: string,
  date: string,
): Promise<{ count: number; date: string }> {
  const activeClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        isNull(clients.archivedAt),
      ),
    );
  for (const c of activeClients) {
    await snapshotClientTiers(organizationId, c.id, date);
  }
  return { count: activeClients.length, date };
}

/**
 * Returns the maximum tier counts a client hit during the given month
 * (the high-water mark). If no snapshots exist for the month yet, falls
 * back to the live counts so brand-new clients before their first cron
 * tick still bill correctly.
 *
 * Pass a YYYY-MM-01 / last-day-of-month range — both inclusive.
 */
export async function getMonthlyHighWaterMarks(
  organizationId: string,
  clientId: string,
  monthStart: string,
  monthEnd: string,
): Promise<TierCounts> {
  const [row] = await db
    .select({
      fullCompute: max(clientTierSnapshots.fullCompute),
      kiosk: max(clientTierSnapshots.kiosk),
      virtualMachine: max(clientTierSnapshots.virtualMachine),
      managedMobile: max(clientTierSnapshots.managedMobile),
      notBillable: max(clientTierSnapshots.notBillable),
      additionalUsers: max(clientTierSnapshots.additionalUsers),
    })
    .from(clientTierSnapshots)
    .where(
      and(
        eq(clientTierSnapshots.organizationId, organizationId),
        eq(clientTierSnapshots.clientId, clientId),
        gte(clientTierSnapshots.snapshotDate, monthStart),
        lte(clientTierSnapshots.snapshotDate, monthEnd),
      ),
    );

  // `max()` returns null when zero rows match. In that case, capture a
  // snapshot for today so future calls have something to work from, and
  // return the live counts as the high-water mark for the partial month.
  if (
    !row ||
    (row.fullCompute === null &&
      row.kiosk === null &&
      row.virtualMachine === null &&
      row.managedMobile === null &&
      row.notBillable === null)
  ) {
    return liveTierCounts(organizationId, clientId);
  }

  return {
    fullCompute: Number(row.fullCompute ?? 0),
    kiosk: Number(row.kiosk ?? 0),
    virtualMachine: Number(row.virtualMachine ?? 0),
    managedMobile: Number(row.managedMobile ?? 0),
    notBillable: Number(row.notBillable ?? 0),
    additionalUsers: Number(row.additionalUsers ?? 0),
  };
}

/**
 * Bulk variant — returns a map of clientId -> high-water mark counts for
 * every active client in the org for the given month. Used by the
 * org-wide /finance/monthly summary so we don't fan out N+1 queries.
 */
export async function getMonthlyHighWaterMarksForOrg(
  organizationId: string,
  monthStart: string,
  monthEnd: string,
): Promise<Map<string, TierCounts>> {
  const rows = await db
    .select({
      clientId: clientTierSnapshots.clientId,
      fullCompute: max(clientTierSnapshots.fullCompute),
      kiosk: max(clientTierSnapshots.kiosk),
      virtualMachine: max(clientTierSnapshots.virtualMachine),
      managedMobile: max(clientTierSnapshots.managedMobile),
      notBillable: max(clientTierSnapshots.notBillable),
      additionalUsers: max(clientTierSnapshots.additionalUsers),
    })
    .from(clientTierSnapshots)
    .where(
      and(
        eq(clientTierSnapshots.organizationId, organizationId),
        gte(clientTierSnapshots.snapshotDate, monthStart),
        lte(clientTierSnapshots.snapshotDate, monthEnd),
      ),
    )
    .groupBy(clientTierSnapshots.clientId);

  const out = new Map<string, TierCounts>();
  for (const r of rows) {
    out.set(r.clientId, {
      fullCompute: Number(r.fullCompute ?? 0),
      kiosk: Number(r.kiosk ?? 0),
      virtualMachine: Number(r.virtualMachine ?? 0),
      managedMobile: Number(r.managedMobile ?? 0),
      notBillable: Number(r.notBillable ?? 0),
      additionalUsers: Number(r.additionalUsers ?? 0),
    });
  }
  return out;
}
