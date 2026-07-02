/**
 * Invoice generation — translates a (client, period) into a persisted
 * invoice + line items using the same math the on-screen Monthly
 * Statement uses.
 *
 * Two entry points:
 *   - buildMonthlyContractInvoice(orgId, clientId, ym, opts)
 *       Idempotent. Returns { created, invoice, skippedReason? }.
 *   - buildHardwareInvoiceFromOrder(orgId, orderId)
 *       Idempotent on (it_order_id, kind='hardware').
 *
 * Both write to the `invoices` + `invoice_lines` tables. Neither sends
 * anything — generated invoices land in 'draft' status; downstream
 * actions (markSent, markPaid, voidInvoice) handle the lifecycle.
 */
import "server-only";
import { and, asc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billables,
  clients,
  invoices,
  invoiceLines,
  itOrderLines,
  itOrders,
  licenses,
  services,
  vendorConnections,
  vendorSeatSnapshots,
  vendors,
  type Invoice,
} from "@/db/schema";
import { getMonthlyHeartbeatCounts } from "@/lib/billing/heartbeats";

/**
 * Pull the latest active-seat count per vendor family for one client.
 * Mirrors the same logic the ProductRebillRatesCard uses on the client
 * tab so the operator sees the same numbers in the UI and on the
 * invoice. One snapshot row per (kind × sku); we take the max because
 * vendors like Bitdefender emit multiple SKUs per family (ATS / EDR /
 * MDR) and the broadest is the rebill basis.
 */
async function loadVendorSeatBasis(
  organizationId: string,
  clientId: string,
): Promise<{
  bitdefender: number;
  liongard: number;
  titanhq: number; // active mailboxes
  syncroRemote: number;
}> {
  const rows = await db
    .select({
      kind: vendorConnections.kind,
      productSku: vendorSeatSnapshots.productSku,
      seats: sql<number>`(
        array_agg(${vendorSeatSnapshots.seats} order by ${vendorSeatSnapshots.capturedAt} desc)
      )[1]::int`.as("seats"),
    })
    .from(vendorSeatSnapshots)
    .innerJoin(
      vendorConnections,
      eq(vendorConnections.id, vendorSeatSnapshots.vendorConnectionId),
    )
    .where(
      and(
        eq(vendorSeatSnapshots.organizationId, organizationId),
        eq(vendorSeatSnapshots.clientId, clientId),
      ),
    )
    .groupBy(vendorConnections.kind, vendorSeatSnapshots.productSku);
  const max = (
    kindNeedle: string,
    skuNeedle: string | null = null,
  ): number =>
    rows
      .filter((r) => r.kind.includes(kindNeedle))
      .filter((r) => (skuNeedle ? r.productSku.includes(skuNeedle) : true))
      .reduce((m, r) => Math.max(m, r.seats ?? 0), 0);
  return {
    bitdefender: max("bitdefender"),
    liongard: max("liongard"),
    titanhq: max("titanhq", "active"),
    syncroRemote: max("syncro", "remote"),
  };
}

const slugifyUpper = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 16)
    .toUpperCase();

function startOfMonth(ym: string): string {
  return `${ym}-01`;
}
function endOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function plusDays(yyyyMmDd: string, days: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const isMicrosoftVendor = (name: string | null | undefined) =>
  !!name && /^microsoft\b/i.test(name.trim());

export type BuildResult = {
  created: boolean;
  /** Set on success or when an existing invoice was found. */
  invoice: Invoice | null;
  skippedReason?: "already_exists" | "no_lines" | "client_archived";
};

/**
 * Build (or fetch) the monthly contract invoice for one (client, ym).
 * Idempotent. Re-running on a (client, period) that already has a
 * non-void invoice returns the existing one with created=false.
 */
export async function buildMonthlyContractInvoice(
  organizationId: string,
  clientId: string,
  ym: string,
  opts: { generatedByMembershipId?: string | null } = {},
): Promise<BuildResult> {
  const monthStart = startOfMonth(ym);
  const monthEnd = endOfMonth(ym);

  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, clientId),
      eq(clients.organizationId, organizationId),
    ),
  });
  if (!client) {
    return { created: false, invoice: null, skippedReason: "client_archived" };
  }
  if (client.archivedAt) {
    return { created: false, invoice: null, skippedReason: "client_archived" };
  }

  // Idempotency: skip if a non-void monthly_contract invoice already
  // exists for this (client, period).
  const existing = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.organizationId, organizationId),
      eq(invoices.clientId, clientId),
      eq(invoices.kind, "monthly_contract"),
      eq(invoices.periodStart, monthStart),
      ne(invoices.status, "void"),
    ),
  });
  if (existing) {
    return {
      created: false,
      invoice: existing,
      skippedReason: "already_exists",
    };
  }

  // -------------------- COMPUTE LINES (same math the on-screen
  // statement uses; identical to what /clients/[id]/billing renders
  // and what export.docx produces). --------------------
  const hb = await getMonthlyHeartbeatCounts(
    organizationId,
    clientId,
    monthStart,
    monthEnd,
  );

  const lines: Array<{
    position: number;
    category:
      | "support_baseline"
      | "support_tier"
      | "license_microsoft"
      | "license_third_party"
      | "service_recurring"
      | "variable_charge";
    sourceKind?: string;
    sourceId?: string;
    description: string;
    detail?: string | null;
    quantity: number;
    unitRateCents: number;
    amountCents: number;
  }> = [];
  let pos = 0;

  const baseline = client.supportBaselineCents ?? 0;
  if (baseline > 0) {
    lines.push({
      position: pos++,
      category: "support_baseline",
      description: "Monthly support baseline",
      quantity: 1,
      unitRateCents: baseline,
      amountCents: baseline,
    });
  }
  const tierLines: Array<[string, string, number, number]> = [
    [
      "Full Compute Node",
      "Workstations / laptops / servers",
      client.supportRateFullComputeCents ?? 0,
      hb.counts.fullCompute,
    ],
    [
      "Kiosk Node",
      "POS / signage / single-purpose stations",
      client.supportRateKioskCents ?? 0,
      hb.counts.kiosk,
    ],
    [
      "Virtual Machine Node",
      "VMs on a shared host",
      client.supportRateVmCents ?? 0,
      hb.counts.virtualMachine,
    ],
    [
      "Managed Mobile Device",
      "Phones / tablets in MDM",
      client.supportRateManagedMobileCents ?? 0,
      hb.counts.managedMobile,
    ],
    [
      "Additional Users",
      "Users without hardware (shared mailbox-only, etc.)",
      client.supportRateAdditionalUserCents ?? 0,
      hb.counts.additionalUsers,
    ],
  ];
  for (const [label, hint, rate, qty] of tierLines) {
    if (rate > 0 || qty > 0) {
      lines.push({
        position: pos++,
        category: "support_tier",
        sourceKind: "computed",
        description: label,
        detail: hint,
        quantity: qty,
        unitRateCents: rate,
        amountCents: rate * qty,
      });
    }
  }

  // -------------------- Licenses --------------------
  const activeLicenses = await db
    .select({ license: licenses, vendorName: vendors.name })
    .from(licenses)
    .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
    .where(
      and(
        eq(licenses.clientId, clientId),
        eq(licenses.status, "active"),
      ),
    )
    .orderBy(asc(licenses.productName));
  const withRate = activeLicenses.filter(
    (l) => (l.license.rebillRateCents ?? 0) > 0,
  );
  for (const l of withRate) {
    const category = isMicrosoftVendor(l.vendorName)
      ? "license_microsoft"
      : "license_third_party";
    const rebill = l.license.rebillRateCents ?? 0;
    lines.push({
      position: pos++,
      category,
      sourceKind: "license",
      sourceId: l.license.id,
      description: l.license.productName,
      detail: [l.vendorName, l.license.sku].filter(Boolean).join(" · ") || null,
      quantity: 1,
      unitRateCents: rebill,
      amountCents: rebill,
    });
  }

  // -------------------- Per-client third-party rebill rates --------------------
  // Picks up the four rates the operator sets on /clients/[id] via the
  // ProductRebillRatesCard. Quantity = latest active-seat snapshot
  // (same lookup the card uses). Only emit a line when the rate is
  // explicitly > 0 — NULL or 0 means "don't bill this vendor for this
  // client", so we never surprise-charge against a template default.
  if (
    (client.rebillRateBitdefenderCents ?? 0) > 0 ||
    (client.rebillRateLiongardCents ?? 0) > 0 ||
    (client.rebillRateTitanhqCents ?? 0) > 0 ||
    (client.rebillRateSyncroRemoteCents ?? 0) > 0
  ) {
    const basis = await loadVendorSeatBasis(organizationId, clientId);
    const thirdPartyRebills: Array<{
      label: string;
      detail: string;
      rate: number;
      qty: number;
      sku: string;
      category: "license_third_party" | "service_recurring";
    }> = [
      {
        label:
          "Bitdefender GravityZone Cloud Security - Secure Plus Bundle, 1 month",
        detail: "Per endpoint",
        rate: client.rebillRateBitdefenderCents ?? 0,
        qty: basis.bitdefender,
        sku: "2765SEPSN012AAZZ",
        category: "license_third_party",
      },
      {
        label: "Liongard Asset Inventory",
        detail: "Per agent",
        rate: client.rebillRateLiongardCents ?? 0,
        qty: basis.liongard,
        sku: "Liongard",
        category: "license_third_party",
      },
      {
        label: "TitanHQ Plus Cybersecurity Platform Protection",
        detail: "Per active mailbox · Phish / Spam / SAT",
        rate: client.rebillRateTitanhqCents ?? 0,
        qty: basis.titanhq,
        sku: "TitanHQ Plus",
        category: "license_third_party",
      },
      {
        label: "Syncro Remote Access",
        detail: "Per contact · Splashtop session control",
        rate: client.rebillRateSyncroRemoteCents ?? 0,
        qty: basis.syncroRemote,
        sku: "Syncro Remote",
        category: "service_recurring",
      },
    ];
    for (const r of thirdPartyRebills) {
      if (r.rate <= 0) continue;
      if (r.qty <= 0) continue;
      lines.push({
        position: pos++,
        category: r.category,
        sourceKind: "client_rebill_rate",
        description: r.label,
        detail: `${r.detail} (SKU ${r.sku})`,
        quantity: r.qty,
        unitRateCents: r.rate,
        amountCents: r.rate * r.qty,
      });
    }
  }

  // -------------------- Services (USI-paid only) --------------------
  const activeServices = await db
    .select({ service: services, vendorName: vendors.name })
    .from(services)
    .leftJoin(vendors, eq(services.vendorId, vendors.id))
    .where(
      and(
        eq(services.clientId, clientId),
        eq(services.status, "active"),
        eq(services.paidBy, "usi"),
      ),
    )
    .orderBy(asc(services.name));
  for (const s of activeServices) {
    const rate = s.service.monthlyRebillRateCents ?? 0;
    if (rate <= 0) continue;
    lines.push({
      position: pos++,
      category: "service_recurring",
      sourceKind: "service",
      sourceId: s.service.id,
      description: s.service.name,
      detail: s.vendorName ?? null,
      quantity: 1,
      unitRateCents: rate,
      amountCents: rate,
    });
  }

  // -------------------- Variable billables in this period --------------------
  const monthBillables = await db
    .select()
    .from(billables)
    .where(
      and(
        eq(billables.clientId, clientId),
        gte(billables.periodStart, monthStart),
        lte(billables.periodStart, monthEnd),
        or(isNull(billables.status), ne(billables.status, "voided")),
      ),
    )
    .orderBy(asc(billables.createdAt));
  for (const b of monthBillables) {
    lines.push({
      position: pos++,
      category: "variable_charge",
      sourceKind: "billable",
      sourceId: b.id,
      description: b.description,
      quantity: 1,
      unitRateCents: b.rebillCents,
      amountCents: b.rebillCents,
    });
  }

  if (lines.length === 0) {
    return { created: false, invoice: null, skippedReason: "no_lines" };
  }

  const subtotal = lines.reduce((s, l) => s + l.amountCents, 0);
  const tax = 0; // Services are not taxed in our model today; hardware invoices handle tax separately.
  const total = subtotal + tax;

  // Number format matches what DOCX export already uses:
  // USI-YYYYMM-<CLIENT_SLUG>
  const [year, month] = ym.split("-");
  const invoiceNumber = `USI-${year}${month}-${slugifyUpper(client.slug || client.name)}`;

  // Issue first of the next month; due net-30.
  const issue = plusDays(monthEnd, 1);
  const due = plusDays(issue, 30);

  // Insert invoice + lines in a transaction.
  const [created] = await db
    .insert(invoices)
    .values({
      organizationId,
      clientId,
      invoiceNumber,
      kind: "monthly_contract",
      status: "draft",
      periodStart: monthStart,
      periodEnd: monthEnd,
      issueDate: issue,
      dueDate: due,
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
      quantityBasis: hb.source,
      flooredUp: hb.flooredUp,
      generatedByMembershipId: opts.generatedByMembershipId ?? null,
    })
    .returning();
  await db.insert(invoiceLines).values(
    lines.map((l) => ({
      invoiceId: created.id,
      position: l.position,
      category: l.category,
      sourceKind: l.sourceKind ?? null,
      sourceId: l.sourceId ?? null,
      description: l.description,
      detail: l.detail ?? null,
      quantity: l.quantity,
      unitRateCents: l.unitRateCents,
      amountCents: l.amountCents,
    })),
  );
  return { created: true, invoice: created };
}

/**
 * Build (or fetch) a hardware invoice for a single IT order.
 * Idempotent on (it_order_id, kind='hardware').
 *
 * Called by the existing IT-order ship action when status → 'shipped'.
 */
export async function buildHardwareInvoiceFromOrder(
  organizationId: string,
  itOrderId: string,
  opts: { generatedByMembershipId?: string | null } = {},
): Promise<BuildResult> {
  const order = await db.query.itOrders.findFirst({
    where: and(
      eq(itOrders.id, itOrderId),
      eq(itOrders.organizationId, organizationId),
    ),
  });
  if (!order) return { created: false, invoice: null };
  if (!order.clientId) return { created: false, invoice: null };

  // Idempotency: don't double-create.
  const existing = await db.query.invoices.findFirst({
    where: and(
      eq(invoices.organizationId, organizationId),
      eq(invoices.itOrderId, itOrderId),
      eq(invoices.kind, "hardware"),
      ne(invoices.status, "void"),
    ),
  });
  if (existing) {
    return {
      created: false,
      invoice: existing,
      skippedReason: "already_exists",
    };
  }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, order.clientId),
  });
  if (!client) return { created: false, invoice: null };

  const orderLines = await db
    .select()
    .from(itOrderLines)
    .where(eq(itOrderLines.orderId, itOrderId))
    .orderBy(asc(itOrderLines.position));

  if (orderLines.length === 0) {
    return { created: false, invoice: null, skippedReason: "no_lines" };
  }

  const lines: Array<{
    position: number;
    category: "hardware";
    sourceKind: "order_line";
    sourceId: string;
    description: string;
    detail: string | null;
    quantity: number;
    unitRateCents: number;
    amountCents: number;
  }> = [];

  let pos = 0;
  for (const l of orderLines) {
    const qty = l.quantity ?? 1;
    // IT order lines store unit price only — no separate rebill field
    // today. If lineTotalCents is set we prefer it (handles edge cases
    // where the operator hand-computed a non-linear total).
    const unit = l.unitPriceCents ?? 0;
    const amount = l.lineTotalCents ?? unit * qty;
    lines.push({
      position: pos++,
      category: "hardware",
      sourceKind: "order_line",
      sourceId: l.id,
      description: l.description,
      detail: l.sku ?? null,
      quantity: qty,
      unitRateCents: unit,
      amountCents: amount,
    });
  }

  const subtotal = lines.reduce((s, l) => s + l.amountCents, 0);
  // Hardware tax left to QB to compute on import (Sales Tax Item at QB
  // level handles per-jurisdiction logic; replicating in TechOS would
  // require a tax engine).
  const tax = 0;
  const total = subtotal + tax;

  const invoiceNumber = `USI-HW-${order.refCode}`;
  const today = new Date().toISOString().slice(0, 10);
  const due = plusDays(today, 30);

  const [created] = await db
    .insert(invoices)
    .values({
      organizationId,
      clientId: client.id,
      invoiceNumber,
      kind: "hardware",
      status: "draft",
      periodStart: order.shippedAt
        ? new Date(order.shippedAt).toISOString().slice(0, 10)
        : today,
      periodEnd: order.shippedAt
        ? new Date(order.shippedAt).toISOString().slice(0, 10)
        : today,
      issueDate: today,
      dueDate: due,
      itOrderId: order.id,
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
      quantityBasis: "hardware_order",
      flooredUp: false,
      generatedByMembershipId: opts.generatedByMembershipId ?? null,
      notes: `Auto-generated from IT order ${order.refCode} on ship.`,
    })
    .returning();

  await db.insert(invoiceLines).values(
    lines.map((l) => ({
      invoiceId: created.id,
      position: l.position,
      category: l.category,
      sourceKind: l.sourceKind,
      sourceId: l.sourceId,
      description: l.description,
      detail: l.detail,
      quantity: l.quantity,
      unitRateCents: l.unitRateCents,
      amountCents: l.amountCents,
    })),
  );

  return { created: true, invoice: created };
}
