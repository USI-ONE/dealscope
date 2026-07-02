/**
 * Ingram Reseller API → vendor_bills sync.
 *
 * Pulls every invoice header from /resellers/v6/invoices and upserts
 * into the existing vendor_bills table. Re-using vendor_bills (rather
 * than a parallel ingram_invoices table) means the existing finance
 * UI, reconciliation report, IIF export, and per-client bill view all
 * pick up Ingram-sourced bills automatically.
 *
 * Idempotency:
 *   Key = (organization_id, vendor_id, external_id=invoiceNumber).
 *   Re-running this sync overwrites mutable fields (status, dates,
 *   totals) but preserves the row ID so any operator-attached notes
 *   or line-item allocations on vendor_bill_lines stay intact.
 *
 * Status mapping:
 *   Ingram               vendor_bill_status
 *   ──────               ──────────────────
 *   OPEN                 received
 *   PAID                 paid
 *   anything else        received  (operator can manually advance)
 *
 * What we DON'T do here:
 *   - Line items. /invoices/{id} returns line detail but each call is
 *     rate-limited; doing 1489 of them in a single sync would take a
 *     long time. Deferred to a per-bill "fetch line items" action.
 *   - Per-client attribution. /invoices doesn't include endUser; the
 *     /orders feed does. Joining requires a separate orders sync —
 *     also deferred. For now, client_id stays NULL and operators
 *     attribute manually as they review.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  vendorBills,
  vendors,
  vendorConnections,
} from "@/db/schema";
import {
  IngramMicroConnector,
  type IngramInvoiceHeader,
} from "./index";

const INGRAM_VENDOR_NAME_PATTERNS = [
  /^ingram micro$/i, // canonical parent
  /^ingram micro inc/i,
];

export type IngramInvoiceSyncResult = {
  totalFetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ invoiceNumber: string; message: string }>;
  vendorMatched: { id: string; name: string } | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

/**
 * Find USI's "Ingram Micro" catalog vendor row. We deliberately match
 * the parent name (not "Ingram Micro Cloud Marketplace" or trendmicro
 * sub-rows) because the invoices come from the parent reseller
 * account and finance treats all Ingram billing as one vendor for AP.
 */
async function findIngramVendor(organizationId: string) {
  const allIngramRows = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.organizationId, organizationId));
  for (const pattern of INGRAM_VENDOR_NAME_PATTERNS) {
    const match = allIngramRows.find((v) => pattern.test(v.name));
    if (match) return match;
  }
  // Fall back to any Ingram* row so we don't hard-fail when the
  // exact name differs.
  return allIngramRows.find((v) => /ingram/i.test(v.name)) ?? null;
}

/** Pick the best date Ingram gave us for "when did the bill arrive". */
function parseDateOrNull(s: string | null | undefined): string | null {
  if (!s) return null;
  // Ingram returns ISO-ish strings: "2026-06-01T13:06:00" or "2026-03-16".
  // We just want the date part for vendor_bills.{received,due,paid}_at.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

/** Convert dollars-as-float to cents-as-int, handling nulls. */
function toCents(v: number | null | undefined): number {
  if (v == null || Number.isNaN(v)) return 0;
  return Math.round(v * 100);
}

/** Map Ingram invoice status → our vendor_bill_status enum. */
function mapStatus(
  ingramStatus: string | null | undefined,
): "received" | "paid" {
  if (!ingramStatus) return "received";
  if (/paid/i.test(ingramStatus)) return "paid";
  return "received";
}

/**
 * Run a full invoice sync for one Ingram connection. Idempotent —
 * safe to re-run.
 */
export async function syncIngramInvoices(input: {
  connectionId: string;
  /** Stop after N pages (each page = 100 records). Useful for the
   *  manual "test sync" button on the integrations page so we don't
   *  pull 1489 rows on every click. Omit to fetch everything. */
  maxPages?: number;
}): Promise<IngramInvoiceSyncResult> {
  const startedAt = new Date();

  // Load the connection + its config.
  const conn = await db.query.vendorConnections.findFirst({
    where: eq(vendorConnections.id, input.connectionId),
  });
  if (!conn) throw new Error(`vendor_connections row ${input.connectionId} not found`);
  if (conn.kind !== "ingram_micro") {
    throw new Error(`Connection ${input.connectionId} is ${conn.kind}, not ingram_micro`);
  }

  // Resolve the catalog vendor we'll attach bills to.
  const vendor = await findIngramVendor(conn.organizationId);
  if (!vendor) {
    throw new Error(
      "No 'Ingram Micro' vendor in vendors catalog. Add one before running sync.",
    );
  }

  // Instantiate the connector and pull all invoices.
  const connector = new IngramMicroConnector(
    (conn.configJson as Record<string, unknown>) ?? {},
  );
  const fetched: IngramInvoiceHeader[] = await connector.listInvoices({
    maxPages: input.maxPages,
  });

  // Ingram's pagination can return the same invoice_number on
  // multiple pages (credit memos, re-issues, debit notes). Dedupe in
  // memory before upsert so we don't race ourselves against the
  // unique index. Keep the LAST occurrence — Ingram tends to put the
  // canonical/most-recent state at the tail.
  const seen = new Map<string, IngramInvoiceHeader>();
  for (const inv of fetched) {
    if (!inv.invoiceNumber) continue;
    seen.set(inv.invoiceNumber, inv);
  }
  const invoices = Array.from(seen.values());

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: IngramInvoiceSyncResult["errors"] = [];

  // Pre-load existing external_ids in one shot to avoid N+1 lookups.
  const existingRows = await db
    .select({
      id: vendorBills.id,
      externalId: vendorBills.externalId,
    })
    .from(vendorBills)
    .where(
      and(
        eq(vendorBills.organizationId, conn.organizationId),
        eq(vendorBills.vendorId, vendor.id),
        isNotNull(vendorBills.externalId),
      ),
    );
  const existingByExternalId = new Map(
    existingRows
      .filter((r) => r.externalId)
      .map((r) => [r.externalId as string, r.id]),
  );

  for (const inv of invoices) {
    if (!inv.invoiceNumber) {
      skipped++;
      continue;
    }
    try {
      const externalId = inv.invoiceNumber;
      const existingId = existingByExternalId.get(externalId);
      const totalCents = toCents(inv.invoiceAmountInclTax);
      const status = mapStatus(inv.invoiceStatus);
      const paidAt =
        status === "paid"
          ? parseDateOrNull(inv.invoiceDate) // best proxy we have
          : null;
      const row = {
        organizationId: conn.organizationId,
        vendorId: vendor.id,
        invoiceNumber: inv.invoiceNumber,
        receivedAt: parseDateOrNull(inv.invoiceDate),
        dueAt: parseDateOrNull(inv.invoiceDueDate),
        paidAt,
        periodStart: parseDateOrNull(inv.orderCreateDate),
        periodEnd: parseDateOrNull(inv.invoiceDate),
        subtotalCents: totalCents, // Ingram doesn't split tax here
        taxCents: 0,
        totalCents,
        status,
        source: "ingram_api",
        externalId,
        externalMetadataJson: inv,
        notes:
          inv.purchaseType || inv.ingramOrderNumber
            ? [
                inv.purchaseType
                  ? `Purchase type: ${inv.purchaseType}`
                  : null,
                inv.ingramOrderNumber
                  ? `Ingram order: ${inv.ingramOrderNumber}`
                  : null,
                inv.customerOrderNumber
                  ? `USI PO: ${inv.customerOrderNumber}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
      } as const;

      if (existingId) {
        await db
          .update(vendorBills)
          .set({
            receivedAt: row.receivedAt,
            dueAt: row.dueAt,
            paidAt: row.paidAt,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            subtotalCents: row.subtotalCents,
            taxCents: row.taxCents,
            totalCents: row.totalCents,
            status: row.status,
            externalMetadataJson: row.externalMetadataJson,
            // We don't overwrite notes on update — operators may have
            // appended their own.
            updatedAt: new Date(),
          })
          .where(eq(vendorBills.id, existingId));
        updated++;
      } else {
        await db.insert(vendorBills).values(row);
        inserted++;
      }
    } catch (err) {
      errors.push({
        invoiceNumber: inv.invoiceNumber,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Stamp the connection so the dashboard shows fresh state.
  const finishedAt = new Date();
  await db
    .update(vendorConnections)
    .set({
      lastSyncAt: finishedAt,
      lastSyncMessage: `Invoice sync — ${inserted} new, ${updated} updated, ${skipped} skipped, ${errors.length} errors (of ${invoices.length} fetched)`,
      updatedAt: finishedAt,
    })
    .where(eq(vendorConnections.id, conn.id));

  return {
    totalFetched: fetched.length,
    inserted,
    updated,
    skipped,
    errors,
    vendorMatched: vendor,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
  };
}
