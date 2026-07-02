/**
 * Hardware heartbeat capture + monthly peak-day counting.
 *
 * Heartbeat model: a hardware row gets one fact row per day it counts
 * as billable. For Syncro-linked devices, the daily cron pulls
 * /customer_assets and inserts a heartbeat when the asset's
 * `updated_at` is within HEARTBEAT_WINDOW_HOURS of the cron's run
 * time. For manually-tracked (non-Syncro) hardware that is
 * `status='active'`, we insert a heartbeat unconditionally — those
 * devices have no automated check-in to read.
 *
 * Billing rule (per USI):
 *
 *   "Only bill for devices that checked in during the billing
 *    month. Bill the high-water mark — the peak same-day concurrent
 *    count of unique devices. If an average of 30 devices checked in
 *    daily but on some day 40 were online concurrently, bill 40."
 *
 * So `getMonthlyHeartbeatCounts()` does, per billing tier:
 *
 *   1. Group heartbeat rows by (billing_tier, heartbeat_date).
 *   2. For each (tier, day) compute distinct(hardware_id) — the
 *      day's concurrent count.
 *   3. Take MAX across days = the month's peak.
 *
 * No "live floor" is applied when we have good heartbeat coverage —
 * if a device exists today but never checked in during the billing
 * month, it stays off the bill (the user's strict rule). The legacy
 * high-water-mark fallback still applies when coverage is too thin
 * to trust (e.g. the rollout month).
 */
import "server-only";
import {
  and,
  countDistinct,
  eq,
  gte,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  hardware,
  hardwareHeartbeats,
} from "@/db/schema";
import {
  isSyncroConfigured,
  listAssetsForCustomer,
  type SyncroAsset,
} from "@/lib/syncro";
import {
  getMonthlyHighWaterMarks,
  liveTierCounts,
  type TierCounts,
} from "./tier-snapshots";

/**
 * How recently must Syncro have touched an asset for it to count as
 * "checked in today"? 36 hours covers daily overnight reboots and the
 * window between the asset agent's last beacon and the cron firing.
 */
export const HEARTBEAT_WINDOW_HOURS = 36;

function withinHeartbeatWindow(updatedAt: string | undefined, now: Date): boolean {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= HEARTBEAT_WINDOW_HOURS * 60 * 60 * 1000;
}

export type HeartbeatCaptureSummary = {
  clientId: string;
  clientName: string;
  syncroLinked: boolean;
  inserted: number;
  /** Syncro-linked devices our cron decided to skip (offline > window). */
  skippedStale: number;
  manualCounted: number;
  errors: string[];
};

/**
 * Record today's heartbeats for one client. Idempotent on the unique
 * (hardware_id, heartbeat_date) index — re-running just no-ops on
 * conflict.
 *
 * - Syncro-linked clients: pulls assets, records a heartbeat for each
 *   asset whose `updated_at` is within HEARTBEAT_WINDOW_HOURS.
 * - All clients: records a heartbeat for any active hardware row that
 *   doesn't have a syncro_asset_id (manual / non-RMM tracked).
 */
export async function captureClientHeartbeats(
  organizationId: string,
  clientId: string,
  today: string,
  now: Date = new Date(),
): Promise<HeartbeatCaptureSummary> {
  const c = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)),
    columns: { id: true, name: true, syncroCustomerId: true },
  });
  if (!c) {
    return {
      clientId,
      clientName: "(not found)",
      syncroLinked: false,
      inserted: 0,
      skippedStale: 0,
      manualCounted: 0,
      errors: ["client not found"],
    };
  }

  const summary: HeartbeatCaptureSummary = {
    clientId: c.id,
    clientName: c.name,
    syncroLinked: !!c.syncroCustomerId,
    inserted: 0,
    skippedStale: 0,
    manualCounted: 0,
    errors: [],
  };

  // All active hardware for this client — keyed by syncroAssetId so we
  // can match Syncro responses + spot non-Syncro rows in one pass.
  // We pull notOnContract here so we can skip writing heartbeats for
  // devices Syncro has flagged "Not on Contract" — those stay visible
  // in TechOS for operational reasons but don't bill.
  const allActive = await db
    .select({
      id: hardware.id,
      syncroAssetId: hardware.syncroAssetId,
      billingTier: hardware.billingTier,
      notOnContract: hardware.notOnContract,
    })
    .from(hardware)
    .where(
      and(
        eq(hardware.organizationId, organizationId),
        eq(hardware.clientId, clientId),
        eq(hardware.status, "active"),
      ),
    );

  const isBillable = (n: string | null) => n !== "1";

  const bySyncroId = new Map<string, (typeof allActive)[number]>();
  const manualRows: typeof allActive = [];
  for (const h of allActive) {
    if (!isBillable(h.notOnContract)) continue;
    if (h.syncroAssetId) bySyncroId.set(h.syncroAssetId, h);
    else manualRows.push(h);
  }

  // --- Syncro pull ---------------------------------------------------
  if (c.syncroCustomerId && isSyncroConfigured()) {
    const cid = parseInt(c.syncroCustomerId, 10);
    if (!Number.isNaN(cid)) {
      let assets: SyncroAsset[] = [];
      try {
        assets = await listAssetsForCustomer(cid);
      } catch (e) {
        summary.errors.push(`Syncro pull failed: ${(e as Error).message}`);
      }
      for (const a of assets) {
        const hw = bySyncroId.get(String(a.id));
        if (!hw) continue; // Asset not yet imported as hardware
        if (!withinHeartbeatWindow(a.updated_at, now)) {
          summary.skippedStale++;
          continue;
        }
        try {
          await insertHeartbeat({
            organizationId,
            clientId: c.id,
            hardwareId: hw.id,
            heartbeatDate: today,
            billingTier: hw.billingTier,
            source: "syncro",
          });
          summary.inserted++;
        } catch (e) {
          summary.errors.push(
            `insert failed for hw ${hw.id}: ${(e as Error).message}`,
          );
        }
      }
    }
  }

  // --- Non-Syncro hardware: always count -----------------------------
  for (const h of manualRows) {
    try {
      await insertHeartbeat({
        organizationId,
        clientId: c.id,
        hardwareId: h.id,
        heartbeatDate: today,
        billingTier: h.billingTier,
        source: "manual",
      });
      summary.manualCounted++;
    } catch (e) {
      summary.errors.push(
        `manual insert failed for hw ${h.id}: ${(e as Error).message}`,
      );
    }
  }

  return summary;
}

async function insertHeartbeat(input: {
  organizationId: string;
  clientId: string;
  hardwareId: string;
  heartbeatDate: string;
  billingTier:
    | "full_compute_node"
    | "kiosk_node"
    | "virtual_machine_node"
    | "managed_mobile_device"
    | "not_billable";
  source: "syncro" | "manual";
}): Promise<void> {
  await db
    .insert(hardwareHeartbeats)
    .values(input)
    .onConflictDoUpdate({
      target: [hardwareHeartbeats.hardwareId, hardwareHeartbeats.heartbeatDate],
      // On replay, keep the row but refresh billing_tier + source in case
      // they changed since the first capture today.
      set: {
        billingTier: input.billingTier,
        source: input.source,
        updatedAt: new Date(),
      },
    });
}

/**
 * Capture heartbeats for every active client in the org.
 */
export async function captureAllClientHeartbeats(
  organizationId: string,
  today: string,
  now: Date = new Date(),
): Promise<HeartbeatCaptureSummary[]> {
  const activeClients = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        isNull(clients.archivedAt),
      ),
    );
  const out: HeartbeatCaptureSummary[] = [];
  for (const c of activeClients) {
    out.push(await captureClientHeartbeats(organizationId, c.id, today, now));
  }
  return out;
}

/* ============================================================================
 * MONTHLY DISTINCT-DEVICE COUNTS
 * ========================================================================== */

export type HeartbeatMonthlyResult = {
  /** Final billable counts per tier.
   *
   *  - When source='heartbeats' (good coverage): peak same-day
   *    concurrent distinct device count per tier. No live floor —
   *    devices that didn't check in during the month stay off the bill.
   *  - When source='fallback' or 'live' (thin coverage): legacy
   *    high-water-mark math with the live-count floor still applied,
   *    so we don't under-bill when we don't have reliable heartbeats. */
  counts: TierCounts;
  /** Raw count from the chosen source before any floor adjustments.
   *  Always equals counts on the heartbeats path. */
  rawCounts: TierCounts;
  /** Live active counts at compute time. Informational on the
   *  heartbeats path; the floor when source='fallback' or 'live'. */
  liveFloor: TierCounts;
  /** Number of days in [monthStart, monthEnd] that have any heartbeat data
   *  for this client. */
  daysWithData: number;
  /** Total days in the month. */
  daysInMonth: number;
  /** "heartbeats" if heartbeat coverage is full, "fallback" if we had to
   *  use the high-water-mark math instead. */
  source: "heartbeats" | "fallback" | "live";
  /** True if applying the live-count floor changed any tier — i.e. the
   *  raw monthly count would have under-billed. */
  flooredUp: boolean;
};

/**
 * Apply the live-count floor: each tier's billable qty is at LEAST
 * today's count of active devices in that tier. Prevents under-billing
 * when devices are temporarily offline (Syncro `updated_at` outside
 * the 36h heartbeat window).
 */
function applyLiveFloor(
  raw: TierCounts,
  live: TierCounts,
): { counts: TierCounts; flooredUp: boolean } {
  const counts: TierCounts = {
    fullCompute: Math.max(raw.fullCompute, live.fullCompute),
    kiosk: Math.max(raw.kiosk, live.kiosk),
    virtualMachine: Math.max(raw.virtualMachine, live.virtualMachine),
    managedMobile: Math.max(raw.managedMobile, live.managedMobile),
    notBillable: Math.max(raw.notBillable, live.notBillable),
    // additionalUsers is a config field, not a hardware count — pass through.
    additionalUsers: raw.additionalUsers,
  };
  const flooredUp =
    counts.fullCompute !== raw.fullCompute ||
    counts.kiosk !== raw.kiosk ||
    counts.virtualMachine !== raw.virtualMachine ||
    counts.managedMobile !== raw.managedMobile ||
    counts.notBillable !== raw.notBillable;
  return { counts, flooredUp };
}

function diffDaysInclusive(monthStart: string, monthEnd: string): number {
  const a = new Date(`${monthStart}T00:00:00Z`).getTime();
  const b = new Date(`${monthEnd}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * For the requested month, return distinct hardware_id counts per
 * billing tier, drawing on the heartbeat fact table. If heartbeats
 * cover < REQUIRED_COVERAGE of the month's days, falls back to the
 * legacy high-water-mark math (which counts ever-active hardware by
 * tier on the daily snapshot rows).
 */
const REQUIRED_COVERAGE = 0.8; // ≥ 80% of days must have heartbeats

export async function getMonthlyHeartbeatCounts(
  organizationId: string,
  clientId: string,
  monthStart: string,
  monthEnd: string,
): Promise<HeartbeatMonthlyResult> {
  const daysInMonth = diffDaysInclusive(monthStart, monthEnd);

  // How many distinct days in the month do we have heartbeats for this client?
  const [{ daysWithData = 0 } = { daysWithData: 0 }] = await db
    .select({
      daysWithData: sql<number>`count(distinct ${hardwareHeartbeats.heartbeatDate})::int`,
    })
    .from(hardwareHeartbeats)
    .where(
      and(
        eq(hardwareHeartbeats.organizationId, organizationId),
        eq(hardwareHeartbeats.clientId, clientId),
        gte(hardwareHeartbeats.heartbeatDate, monthStart),
        lte(hardwareHeartbeats.heartbeatDate, monthEnd),
      ),
    );

  // Live counts always — they're the floor regardless of which path we
  // take. A device that's `status='active'` today never falls out of
  // billing just because it didn't heartbeat in the heartbeat window.
  const live = await liveTierCounts(organizationId, clientId);

  // If coverage is too thin, fall back to high-water-mark math. Brand-new
  // clients with no snapshots either go to live counts inside that helper.
  if (daysWithData / daysInMonth < REQUIRED_COVERAGE) {
    const hwm = await getMonthlyHighWaterMarks(
      organizationId,
      clientId,
      monthStart,
      monthEnd,
    );
    const floored = applyLiveFloor(hwm, live);
    return {
      counts: floored.counts,
      rawCounts: hwm,
      liveFloor: live,
      daysWithData,
      daysInMonth,
      source: daysWithData === 0 ? "live" : "fallback",
      flooredUp: floored.flooredUp,
    };
  }

  // We have enough heartbeat coverage — compute the PEAK same-day
  // concurrent count per tier. The inner query gets a daily count of
  // distinct devices per (tier, date); the outer takes MAX across
  // days. So a tier that peaked at 40 unique devices on May 22 reports
  // 40 even if the daily average for May was 30.
  //
  // Defensive: join to hardware so we can also exclude any device that
  // is currently flagged "Not on Contract" — even if it heart-beat
  // earlier in the month before being marked NoC, we honour the flag
  // and drop it from the bill.
  const rows = await db.execute<{
    billing_tier: string;
    peak_daily_distinct: number;
  }>(sql`
    select
      sub.billing_tier,
      max(sub.daily_distinct)::int as peak_daily_distinct
    from (
      select
        hh.billing_tier,
        hh.heartbeat_date,
        count(distinct hh.hardware_id)::int as daily_distinct
      from hardware_heartbeats hh
      join hardware h on h.id = hh.hardware_id
      where hh.organization_id = ${organizationId}
        and hh.client_id = ${clientId}
        and hh.heartbeat_date >= ${monthStart}
        and hh.heartbeat_date <= ${monthEnd}
        and (h.not_on_contract is null or h.not_on_contract <> '1')
      group by hh.billing_tier, hh.heartbeat_date
    ) sub
    group by sub.billing_tier
  `);

  const counts: TierCounts = {
    fullCompute: 0,
    kiosk: 0,
    virtualMachine: 0,
    managedMobile: 0,
    notBillable: 0,
    additionalUsers: 0,
  };
  for (const r of rows as unknown as Array<{
    billing_tier: string;
    peak_daily_distinct: number;
  }>) {
    const n = Number(r.peak_daily_distinct ?? 0);
    switch (r.billing_tier) {
      case "full_compute_node":
        counts.fullCompute = n;
        break;
      case "kiosk_node":
        counts.kiosk = n;
        break;
      case "virtual_machine_node":
        counts.virtualMachine = n;
        break;
      case "managed_mobile_device":
        counts.managedMobile = n;
        break;
      case "not_billable":
        counts.notBillable = n;
        break;
    }
  }

  // Mirror clients.additionalUserCount — heartbeats don't track this.
  const cliRow = await db.query.clients.findFirst({
    where: and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)),
    columns: { additionalUserCount: true },
  });
  counts.additionalUsers = cliRow?.additionalUserCount ?? 0;

  // STRICT: when heartbeat coverage is good, do NOT apply the live
  // floor. The billing rule is "only bill for devices that checked
  // in during the month" — a device that exists today but never
  // checked in during the billing month stays off the bill.
  return {
    counts,
    rawCounts: counts,
    liveFloor: live,
    daysWithData,
    daysInMonth,
    source: "heartbeats",
    flooredUp: false,
  };
}

/**
 * Bulk variant for the org-wide finance summary. Returns one result per
 * client. Falls back to high-water-mark per-client where coverage is thin.
 */
export async function getMonthlyHeartbeatCountsForOrg(
  organizationId: string,
  monthStart: string,
  monthEnd: string,
): Promise<Map<string, HeartbeatMonthlyResult>> {
  const daysInMonth = diffDaysInclusive(monthStart, monthEnd);

  // Days with data per client
  const dayRows = await db
    .select({
      clientId: hardwareHeartbeats.clientId,
      daysWithData: sql<number>`count(distinct ${hardwareHeartbeats.heartbeatDate})::int`,
    })
    .from(hardwareHeartbeats)
    .where(
      and(
        eq(hardwareHeartbeats.organizationId, organizationId),
        gte(hardwareHeartbeats.heartbeatDate, monthStart),
        lte(hardwareHeartbeats.heartbeatDate, monthEnd),
      ),
    )
    .groupBy(hardwareHeartbeats.clientId);
  const daysByClient = new Map(
    dayRows.map((r) => [r.clientId, Number(r.daysWithData ?? 0)] as const),
  );

  // Peak same-day concurrent device count per (client, tier) —
  // inner query gets distinct devices per (client, tier, date);
  // outer takes MAX across days. Mirrors the per-client logic above.
  const countRows = await db.execute<{
    client_id: string;
    billing_tier: string;
    peak_daily_distinct: number;
  }>(sql`
    select
      sub.client_id,
      sub.billing_tier,
      max(sub.daily_distinct)::int as peak_daily_distinct
    from (
      select
        hh.client_id,
        hh.billing_tier,
        hh.heartbeat_date,
        count(distinct hh.hardware_id)::int as daily_distinct
      from hardware_heartbeats hh
      join hardware h on h.id = hh.hardware_id
      where hh.organization_id = ${organizationId}
        and hh.heartbeat_date >= ${monthStart}
        and hh.heartbeat_date <= ${monthEnd}
        and (h.not_on_contract is null or h.not_on_contract <> '1')
      group by hh.client_id, hh.billing_tier, hh.heartbeat_date
    ) sub
    group by sub.client_id, sub.billing_tier
  `);

  // additionalUserCount per client
  const cliRows = await db
    .select({
      id: clients.id,
      additionalUserCount: clients.additionalUserCount,
    })
    .from(clients)
    .where(eq(clients.organizationId, organizationId));
  const auByClient = new Map(
    cliRows.map((c) => [c.id, c.additionalUserCount ?? 0] as const),
  );

  // Assemble. Always apply the live-count floor per client.
  const byClient = new Map<string, HeartbeatMonthlyResult>();
  for (const c of cliRows) {
    const daysWithData = daysByClient.get(c.id) ?? 0;
    const live = await liveTierCounts(organizationId, c.id);
    if (daysWithData / daysInMonth < REQUIRED_COVERAGE) {
      const hwm = await getMonthlyHighWaterMarks(
        organizationId,
        c.id,
        monthStart,
        monthEnd,
      );
      const floored = applyLiveFloor(hwm, live);
      byClient.set(c.id, {
        counts: floored.counts,
        rawCounts: hwm,
        liveFloor: live,
        daysWithData,
        daysInMonth,
        source: daysWithData === 0 ? "live" : "fallback",
        flooredUp: floored.flooredUp,
      });
      continue;
    }
    const counts: TierCounts = {
      fullCompute: 0,
      kiosk: 0,
      virtualMachine: 0,
      managedMobile: 0,
      notBillable: 0,
      additionalUsers: auByClient.get(c.id) ?? 0,
    };
    for (const r of countRows as unknown as Array<{
      client_id: string;
      billing_tier: string;
      peak_daily_distinct: number;
    }>) {
      if (r.client_id !== c.id) continue;
      const n = Number(r.peak_daily_distinct ?? 0);
      switch (r.billing_tier) {
        case "full_compute_node":
          counts.fullCompute = n;
          break;
        case "kiosk_node":
          counts.kiosk = n;
          break;
        case "virtual_machine_node":
          counts.virtualMachine = n;
          break;
        case "managed_mobile_device":
          counts.managedMobile = n;
          break;
        case "not_billable":
          counts.notBillable = n;
          break;
      }
    }
    // STRICT: no live floor on the heartbeats path. Only devices
    // that actually checked in during the billing month count.
    byClient.set(c.id, {
      counts,
      rawCounts: counts,
      liveFloor: live,
      daysWithData,
      daysInMonth,
      source: "heartbeats",
      flooredUp: false,
    });
  }
  return byClient;
}

