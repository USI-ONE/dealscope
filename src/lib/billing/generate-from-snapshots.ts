/**
 * Month-end billables generator from vendor seat snapshots.
 *
 * For a given org and period, walk every (mapped client, license)
 * pair where:
 *   • the license has a rebill_rate_cents set,
 *   • the most recent vendor_seat_snapshot for that client + vendor
 *     reports N > 0 seats,
 *   • no draft/approved billable already exists for that license × period.
 *
 * Create a draft `billables` row with cost basis × markup math pre-filled
 * from the license. Operator reviews on /finance/billables and flips to
 * "billed" to roll into the month's invoice batch.
 *
 * This is the "live" end of the integrations pipeline — every vendor
 * sync → snapshot → license seat update → at month-end → ready-to-
 * invoice draft billable, all without manual entry.
 */
import { and, eq, gte, lte, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billables,
  licenses,
  vendorConnections,
} from "@/db/schema";

export type GenerateBillablesOptions = {
  organizationId: string;
  /** Period start (YYYY-MM-DD). Inclusive. */
  periodStart: string;
  /** Period end (YYYY-MM-DD). Inclusive. */
  periodEnd: string;
  /** When true, run without writing. Used by the preview UI. */
  dryRun?: boolean;
};

export type GeneratedBillableRow = {
  clientId: string;
  clientName: string | null;
  licenseId: string;
  productName: string;
  vendorName: string | null;
  seats: number;
  costBasisCents: number;
  rebillRateCents: number;
  costTotalCents: number;
  rebillTotalCents: number;
  marginCents: number;
  /** ID of the billable row created (or null in dry-run). */
  billableId: string | null;
  /** True if a billable already existed for this license × period
   *  and we skipped to avoid duplicates. */
  skippedExisting: boolean;
};

export async function generateMonthlyBillablesFromSnapshots(
  opts: GenerateBillablesOptions,
): Promise<GeneratedBillableRow[]> {
  const { organizationId, periodStart, periodEnd, dryRun = false } = opts;

  // Latest snapshot per (mapped client, vendor_connection × product),
  // joined to the licenses row we want to bill against. We rely on the
  // matching done by applySnapshotsToLicenses to ensure licenses.seats_total
  // already reflects the snapshot — so we can just read seats_total off
  // the license. (Snapshots remain the audit trail.)
  const candidates = await db
    .select({
      license: licenses,
    })
    .from(licenses)
    .where(
      and(
        eq(licenses.organizationId, organizationId),
        eq(licenses.status, "active"),
        isNotNull(licenses.clientId),
        isNotNull(licenses.rebillRateCents),
      ),
    );

  // Existing draft/approved/billed billables in this period — used to
  // dedupe so re-running the generator doesn't pile on duplicates.
  const existing = await db
    .select({
      licenseId: billables.licenseId,
      clientId: billables.clientId,
    })
    .from(billables)
    .where(
      and(
        eq(billables.organizationId, organizationId),
        gte(billables.periodStart, periodStart),
        lte(billables.periodEnd, periodEnd),
        // Anything not voided counts as "already there".
        sql`${billables.status} <> 'voided'`,
      ),
    );
  const existingKeys = new Set(
    existing
      .filter((r) => r.licenseId)
      .map((r) => `${r.licenseId}::${r.clientId}`),
  );

  // Resolve vendor + client names in one cheap pass so the preview UI
  // has labels.
  const labels = await db.execute<{
    license_id: string;
    client_id: string;
    client_name: string;
    vendor_name: string | null;
  }>(sql`
    SELECT
      l.id          AS license_id,
      l.client_id   AS client_id,
      c.name        AS client_name,
      v.name        AS vendor_name
    FROM licenses l
    JOIN clients c ON c.id = l.client_id
    LEFT JOIN vendors v ON v.id = l.vendor_id
    WHERE l.organization_id = ${organizationId}
  `);
  const labelByLicense = new Map(
    labels.rows.map(
      (r) =>
        [
          r.license_id,
          { clientName: r.client_name, vendorName: r.vendor_name },
        ] as const,
    ),
  );

  const out: GeneratedBillableRow[] = [];
  for (const c of candidates) {
    const lic = c.license;
    if (!lic.clientId || !lic.rebillRateCents) continue;
    const seats = lic.seatsTotal ?? 0;
    if (seats <= 0) continue;
    const key = `${lic.id}::${lic.clientId}`;
    const skippedExisting = existingKeys.has(key);
    const cost = (lic.costBasisCents ?? 0) * seats;
    const rebill = lic.rebillRateCents * seats;
    const margin = rebill - cost;
    const lbl = labelByLicense.get(lic.id);

    let billableId: string | null = null;
    if (!dryRun && !skippedExisting) {
      const [created] = await db
        .insert(billables)
        .values({
          organizationId,
          clientId: lic.clientId,
          licenseId: lic.id,
          description: `${lic.productName}${lbl?.vendorName ? ` — ${lbl.vendorName}` : ""} (${seats} seat${seats === 1 ? "" : "s"})`,
          periodStart,
          periodEnd,
          quantity: seats,
          costBasisCents: cost,
          markupPct: lic.markupPct ?? 0,
          markupCents: margin,
          rebillCents: rebill,
          status: "draft",
        })
        .returning({ id: billables.id });
      billableId = created.id;
    }

    out.push({
      clientId: lic.clientId,
      clientName: lbl?.clientName ?? null,
      licenseId: lic.id,
      productName: lic.productName,
      vendorName: lbl?.vendorName ?? null,
      seats,
      costBasisCents: lic.costBasisCents ?? 0,
      rebillRateCents: lic.rebillRateCents,
      costTotalCents: cost,
      rebillTotalCents: rebill,
      marginCents: margin,
      billableId,
      skippedExisting,
    });
  }

  return out;
}

/**
 * Used by /finance/billables to surface the "Generate from snapshots"
 * button. Returns the active vendor_connections so the UI can hint
 * which sources fed the data.
 */
export async function listActiveSyncSources(organizationId: string) {
  return db
    .select({
      id: vendorConnections.id,
      kind: vendorConnections.kind,
      displayName: vendorConnections.displayName,
      lastSyncAt: vendorConnections.lastSyncAt,
    })
    .from(vendorConnections)
    .where(
      and(
        eq(vendorConnections.organizationId, organizationId),
        eq(vendorConnections.enabled, true),
      ),
    );
}
