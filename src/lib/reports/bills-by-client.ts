/**
 * "Bills by client + location" report data builder.
 *
 * For a given date range, returns every vendor-bill line in the org with
 * its client + location attribution and quantity. Lines without a
 * client are emitted as "Unassigned" so the user can spot missing
 * attributions.
 *
 * Shared between the page and the CSV export so both stay in sync.
 */
import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  clientLocations,
  clients,
  vendorBillLines,
  vendorBills,
  vendors,
} from "@/db/schema";

export type BillLineRow = {
  lineId: string;
  billId: string;
  invoiceNumber: string | null;
  vendorName: string | null;
  receivedAt: string | null;
  description: string;
  sku: string | null;
  quantity: number | null;
  totalCents: number;
  periodStart: string | null;
  periodEnd: string | null;
  clientId: string | null;
  clientName: string | null;
  locationId: string | null;
  locationLabel: string | null;
};

export type BillsByClientRange = {
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
};

export function defaultRange(): BillsByClientRange {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function rangeForMonth(ym: string): BillsByClientRange {
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

export async function getBillsByClientLines(
  organizationId: string,
  range: BillsByClientRange,
  filterClientId?: string | null,
): Promise<BillLineRow[]> {
  const conditions = [
    eq(vendorBills.organizationId, organizationId),
    gte(vendorBills.receivedAt, range.start),
    lte(vendorBills.receivedAt, range.end),
  ];

  const rows = await db
    .select({
      line: vendorBillLines,
      bill: vendorBills,
      vendor: vendors,
      clientName: clients.name,
      locationLabel: clientLocations.label,
    })
    .from(vendorBillLines)
    .innerJoin(vendorBills, eq(vendorBillLines.billId, vendorBills.id))
    .leftJoin(vendors, eq(vendorBills.vendorId, vendors.id))
    .leftJoin(clients, eq(vendorBillLines.clientId, clients.id))
    .leftJoin(
      clientLocations,
      eq(vendorBillLines.locationId, clientLocations.id),
    )
    .where(and(...conditions))
    .orderBy(asc(clients.name), asc(vendors.name), asc(vendorBills.receivedAt));

  const out: BillLineRow[] = rows.map((r) => ({
    lineId: r.line.id,
    billId: r.bill.id,
    invoiceNumber: r.bill.invoiceNumber,
    vendorName: r.vendor?.name ?? null,
    receivedAt: r.bill.receivedAt,
    description: r.line.description,
    sku: r.line.sku,
    quantity: r.line.quantity,
    totalCents: r.line.totalCents,
    periodStart: r.line.periodStart,
    periodEnd: r.line.periodEnd,
    clientId: r.line.clientId,
    clientName: r.clientName,
    locationId: r.line.locationId,
    locationLabel: r.locationLabel,
  }));

  if (filterClientId) {
    return out.filter((r) => r.clientId === filterClientId);
  }
  return out;
}

/**
 * Group lines by (client, location) and sum totals/quantities — the shape
 * the user described: "quantity by client and location".
 */
export type ClientLocationGroup = {
  clientId: string | null;
  clientName: string;
  locationId: string | null;
  locationLabel: string;
  totalQuantity: number;
  totalCents: number;
  lineCount: number;
};

export function groupByClientLocation(
  lines: BillLineRow[],
): ClientLocationGroup[] {
  const map = new Map<string, ClientLocationGroup>();
  for (const l of lines) {
    const key = `${l.clientId ?? "unassigned"}|${l.locationId ?? "no_location"}`;
    const g = map.get(key) ?? {
      clientId: l.clientId,
      clientName: l.clientName ?? "Unassigned",
      locationId: l.locationId,
      locationLabel: l.locationLabel ?? "Client-wide",
      totalQuantity: 0,
      totalCents: 0,
      lineCount: 0,
    };
    g.totalQuantity += l.quantity ?? 0;
    g.totalCents += l.totalCents;
    g.lineCount += 1;
    map.set(key, g);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.clientName !== b.clientName)
      return a.clientName.localeCompare(b.clientName);
    return a.locationLabel.localeCompare(b.locationLabel);
  });
}
