/**
 * After a successful vendor seat sync, walk the latest snapshots and
 * push the seat count into the matching `licenses` row so the rest
 * of TechOS (billing, reconciliation report, per-client license card)
 * reflects what the vendor's API actually reports.
 *
 * Matching rules (tightest meaningful join — we can refine when we add
 * vendor_product_sku to licenses later):
 *   • Same TechOS client (snapshot.client_id = licenses.client_id)
 *   • Same vendor (connection.vendor_id = licenses.vendor_id)
 *   • Active status (licenses.status = 'active')
 *   • Snapshot product_sku → license product_name fuzzy match. If a
 *     license has a `sku` column value, prefer SKU match first.
 *
 * If multiple license rows match the same (client, vendor) pair (e.g. a
 * client has 3 license rows under one vendor for different SKUs), we
 * pick the row whose product_name best matches the snapshot's
 * productName using normalized substring comparison. Ties broken by
 * smallest license id so we're deterministic across re-runs.
 *
 * Updates are only applied when seats actually changed — keeps
 * client_events log clean.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clientEvents,
  licenses,
  vendorConnections,
  vendorSeatSnapshots,
  type VendorSeatSnapshot,
  type License,
} from "@/db/schema";
import { sql } from "drizzle-orm";

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();

/**
 * Pick the most-likely matching license row from a list of candidates,
 * given a snapshot. Returns null when nothing's close enough.
 */
function pickMatchingLicense(
  snapshot: { productSku: string; productName: string },
  candidates: License[],
): License | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const snapSku = normalize(snapshot.productSku);
  const snapName = normalize(snapshot.productName);

  // 1. Exact SKU match wins.
  const skuMatch = candidates.find(
    (c) => c.sku && normalize(c.sku) === snapSku,
  );
  if (skuMatch) return skuMatch;

  // 2. License product_name contains (or is contained by) snapshot
  //    productName. Longest overlap wins.
  let best: { lic: License; score: number } | null = null;
  for (const c of candidates) {
    const candName = normalize(c.productName);
    let score = 0;
    if (candName === snapName) score = 1000;
    else if (candName.includes(snapName) || snapName.includes(candName)) {
      score = Math.min(candName.length, snapName.length);
    }
    if (!best || score > best.score) best = { lic: c, score };
  }
  return best && best.score > 0 ? best.lic : null;
}

/**
 * For one connection, look at the *latest* snapshot per
 * (vendor_client, product_sku), then push seat counts into licenses.
 *
 * Returns a summary so the caller (sync-runner) can log it.
 */
export async function applySnapshotsToLicenses(
  organizationId: string,
  vendorConnectionId: string,
): Promise<{
  updates: number;
  noMatch: number;
  unchanged: number;
}> {
  const conn = await db.query.vendorConnections.findFirst({
    where: and(
      eq(vendorConnections.id, vendorConnectionId),
      eq(vendorConnections.organizationId, organizationId),
    ),
  });
  if (!conn || !conn.vendorId) {
    // No mapped catalog vendor → we can't link to licenses. Skip
    // silently; the operator can fix by setting vendor_id on the
    // connection row.
    return { updates: 0, noMatch: 0, unchanged: 0 };
  }
  const vendorId = conn.vendorId;

  // Latest snapshot per (mapped client, product_sku) for this
  // connection. Unmapped (client_id = null) rows can't be applied.
  const latest = await db.execute<{
    client_id: string;
    vendor_client_name: string;
    product_sku: string;
    product_name: string;
    seats: number;
  }>(sql`
    SELECT DISTINCT ON (s.client_id, s.product_sku)
      s.client_id,
      s.vendor_client_name,
      s.product_sku,
      s.product_name,
      s.seats
    FROM vendor_seat_snapshots s
    WHERE s.vendor_connection_id = ${vendorConnectionId}
      AND s.organization_id = ${organizationId}
      AND s.client_id IS NOT NULL
    ORDER BY
      s.client_id,
      s.product_sku,
      s.captured_at DESC
  `);

  let updates = 0;
  let noMatch = 0;
  let unchanged = 0;

  // Group snapshots by client so we can fetch licenses once per client.
  const byClient = new Map<string, typeof latest.rows>();
  for (const r of latest.rows) {
    const arr = byClient.get(r.client_id) ?? [];
    arr.push(r);
    byClient.set(r.client_id, arr);
  }

  for (const [clientId, clientSnapshots] of byClient.entries()) {
    const clientLicenses = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.organizationId, organizationId),
          eq(licenses.clientId, clientId),
          eq(licenses.vendorId, vendorId),
          eq(licenses.status, "active"),
        ),
      );
    // Track which license rows have been claimed by a snapshot already
    // so two snapshots can't both write to the same row.
    const claimed = new Set<string>();
    for (const s of clientSnapshots) {
      const candidates = clientLicenses.filter((l) => !claimed.has(l.id));
      const match = pickMatchingLicense(
        { productSku: s.product_sku, productName: s.product_name },
        candidates,
      );
      if (!match) {
        noMatch++;
        continue;
      }
      claimed.add(match.id);
      if (match.seatsTotal === s.seats) {
        unchanged++;
        continue;
      }
      const prev = match.seatsTotal ?? 0;
      await db
        .update(licenses)
        .set({
          seatsTotal: s.seats,
          updatedAt: new Date(),
        })
        .where(eq(licenses.id, match.id));
      // Audit trail — surfaced on /clients/[id] Runbook tab event log.
      await db.insert(clientEvents).values({
        organizationId,
        clientId,
        occurredAt: new Date(),
        kind: "change",
        severity: "info",
        title: `License seats updated: ${match.productName}`,
        narrative:
          `Vendor sync updated seat count from ${prev} → ${s.seats} ` +
          `based on ${conn.displayName} snapshot.`,
        affectedSystems: [conn.displayName, match.productName],
      });
      updates++;
    }
  }

  return { updates, noMatch, unchanged };
}

// Re-export the snapshot type for callers that want to log shape.
export type { VendorSeatSnapshot };
