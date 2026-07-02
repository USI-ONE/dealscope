/**
 * Builds the line-level invoice detail for a given org + month.
 *
 * The page UI and the CSV export both call this so they stay perfectly in
 * sync. Each row is one billable line that finance will paste into the
 * billing system.
 */
import { and, asc, eq, gte, isNull, lte, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  billables,
  clients,
  licenses,
  services,
  vendors,
} from "@/db/schema";
import { getMonthlyHeartbeatCountsForOrg } from "@/lib/billing/heartbeats";

export type InvoiceCategory =
  | "support"
  | "license_microsoft"
  | "license_thirdparty"
  | "service"
  | "variable";

export type InvoiceLine = {
  clientId: string;
  clientName: string;
  category: InvoiceCategory;
  subcategory: string;
  description: string;
  reference: string;
  qty: number;
  unitRateCents: number;
  subtotalCents: number;
};

export const CATEGORY_LABEL: Record<InvoiceCategory, string> = {
  support: "Contracted support",
  license_microsoft: "Microsoft licenses",
  license_thirdparty: "Third-party licenses",
  service: "Recurring services",
  variable: "Variable charges",
};

const isMicrosoftVendor = (name: string | null | undefined) =>
  !!name && /^microsoft\b/i.test(name.trim());

export type InvoiceMonthRange = {
  month: string; // YYYY-MM
  monthStart: string; // YYYY-MM-01
  monthEnd: string; // last day
};

export function thisYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(ym: string): InvoiceMonthRange {
  const [y, m] = ym.split("-").map(Number);
  const monthStart = `${ym}-01`;
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { month: ym, monthStart, monthEnd };
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export async function getInvoiceDetailLines(
  organizationId: string,
  ym: string,
): Promise<{ lines: InvoiceLine[]; range: InvoiceMonthRange }> {
  const range = monthRange(ym);

  const [
    clientRows,
    licenseRows,
    serviceRows,
    billableRows,
    hbByClient,
  ] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.organizationId, organizationId),
          isNull(clients.archivedAt),
        ),
      )
      .orderBy(asc(clients.name)),
    db
      .select({
        license: licenses,
        vendorName: vendors.name,
      })
      .from(licenses)
      .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
      .where(
        and(
          eq(licenses.organizationId, organizationId),
          eq(licenses.status, "active"),
        ),
      )
      .orderBy(asc(licenses.productName)),
    db
      .select({
        service: services,
        vendorName: vendors.name,
      })
      .from(services)
      .leftJoin(vendors, eq(services.vendorId, vendors.id))
      .where(
        and(
          eq(services.organizationId, organizationId),
          eq(services.status, "active"),
          // Only services USI pays for hit invoice detail. Client-direct
          // services live in the client services card for reference but
          // never bill through us.
          eq(services.paidBy, "usi"),
        ),
      )
      .orderBy(asc(services.name)),
    db
      .select()
      .from(billables)
      .where(
        and(
          eq(billables.organizationId, organizationId),
          gte(billables.periodStart, range.monthStart),
          lte(billables.periodStart, range.monthEnd),
          or(isNull(billables.status), ne(billables.status, "voided")),
        ),
      )
      .orderBy(asc(billables.createdAt)),
    // Distinct-device counts per tier for the month (drives billing qty
    // per tier). Falls back internally to high-water-mark or live counts
    // when heartbeat coverage is thin.
    getMonthlyHeartbeatCountsForOrg(
      organizationId,
      range.monthStart,
      range.monthEnd,
    ),
  ]);

  const lines: InvoiceLine[] = [];

  for (const c of clientRows) {
    // ---- Contracted support per tier (distinct devices this month) ----
    const counts = hbByClient.get(c.id)?.counts;
    const fullCompute = counts?.fullCompute ?? 0;
    const kiosk = counts?.kiosk ?? 0;
    const vm = counts?.virtualMachine ?? 0;
    const managedMobile = counts?.managedMobile ?? 0;
    const additionalUsers = counts?.additionalUsers ?? c.additionalUserCount ?? 0;

    const baseline = c.supportBaselineCents ?? 0;
    if (baseline > 0) {
      lines.push({
        clientId: c.id,
        clientName: c.name,
        category: "support",
        subcategory: "Baseline",
        description: "Monthly support baseline",
        reference: "",
        qty: 1,
        unitRateCents: baseline,
        subtotalCents: baseline,
      });
    }

    type TierRow = {
      sub: string;
      desc: string;
      qty: number;
      rate: number;
    };
    const tierRows: TierRow[] = [
      {
        sub: "Full Compute",
        desc: "Full Compute Node (workstation / laptop / server)",
        qty: fullCompute,
        rate: c.supportRateFullComputeCents ?? 0,
      },
      {
        sub: "Kiosk",
        desc: "Kiosk Node (POS / signage / single-purpose)",
        qty: kiosk,
        rate: c.supportRateKioskCents ?? 0,
      },
      {
        sub: "Virtual Machine",
        desc: "Virtual Machine Node",
        qty: vm,
        rate: c.supportRateVmCents ?? 0,
      },
      {
        sub: "Managed Mobile",
        desc: "Managed Mobile Device",
        qty: managedMobile,
        rate: c.supportRateManagedMobileCents ?? 0,
      },
      {
        sub: "Additional Users",
        desc: "Additional User (no dedicated hardware)",
        qty: additionalUsers,
        rate: c.supportRateAdditionalUserCents ?? 0,
      },
    ];
    for (const t of tierRows) {
      // Only emit a line if there's something to charge for. We deliberately
      // skip rows where qty=0 OR rate=0 so the export stays paste-ready.
      if (t.qty > 0 && t.rate > 0) {
        lines.push({
          clientId: c.id,
          clientName: c.name,
          category: "support",
          subcategory: t.sub,
          description: t.desc,
          reference: "",
          qty: t.qty,
          unitRateCents: t.rate,
          subtotalCents: t.qty * t.rate,
        });
      }
    }

    // ---- Licenses (Microsoft + third-party) -------------------------------
    const lic = licenseRows.filter(
      (l) => l.license.clientId === c.id && (l.license.rebillRateCents ?? 0) > 0,
    );
    for (const l of lic) {
      const isMs = isMicrosoftVendor(l.vendorName);
      const seats = l.license.seatsTotal ?? 0;
      const total = l.license.rebillRateCents ?? 0;
      const perSeat = seats > 0 ? Math.round(total / seats) : total;
      lines.push({
        clientId: c.id,
        clientName: c.name,
        category: isMs ? "license_microsoft" : "license_thirdparty",
        subcategory: l.vendorName ?? "—",
        description: l.license.productName,
        reference: l.license.sku ?? "",
        qty: seats > 0 ? seats : 1,
        unitRateCents: perSeat,
        subtotalCents: total,
      });
    }

    // ---- Recurring services ----------------------------------------------
    const svc = serviceRows.filter(
      (s) =>
        s.service.clientId === c.id &&
        (s.service.monthlyRebillRateCents ?? 0) > 0,
    );
    for (const s of svc) {
      const total = s.service.monthlyRebillRateCents ?? 0;
      lines.push({
        clientId: c.id,
        clientName: c.name,
        category: "service",
        subcategory: s.vendorName ?? "—",
        description: s.service.name,
        reference: "",
        qty: 1,
        unitRateCents: total,
        subtotalCents: total,
      });
    }

    // ---- Variable billables ---------------------------------------------
    const bills = billableRows.filter((b) => b.clientId === c.id);
    for (const b of bills) {
      lines.push({
        clientId: c.id,
        clientName: c.name,
        category: "variable",
        subcategory: b.status ?? "draft",
        description: b.description,
        reference: b.invoiceReference ?? "",
        qty: 1,
        unitRateCents: b.rebillCents,
        subtotalCents: b.rebillCents,
      });
    }
  }

  return { lines, range };
}

/**
 * RFC 4180-ish CSV escape: wrap in quotes, double-up any quote chars.
 */
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function fmtUsdCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
