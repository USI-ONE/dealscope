/**
 * GET /clients/[id]/billing/export.docx?month=YYYY-MM
 *
 * Generates a customer-facing monthly invoice DOCX. Data comes from
 * the same queries the on-screen Monthly Statement uses, so the file
 * value always matches the page exactly.
 */
import { and, asc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billables,
  clients,
  licenses,
  services,
  vendorConnections,
  vendorSeatSnapshots,
  vendors,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { getMonthlyHeartbeatCounts } from "@/lib/billing/heartbeats";
import {
  buildClientInvoiceDocx,
  type InvoiceLicenseLine,
  type InvoiceServiceLine,
  type InvoiceSupportLine,
  type InvoiceVariableLine,
} from "@/lib/billing/invoice-docx-builder";

export const runtime = "nodejs";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function startOfMonth(ym: string): string {
  return `${ym}-01`;
}
function endOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function thisYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** Common invoice numbering: USI-YYYYMM-<client-slug-uppercase>. */
function invoiceNumber(monthYm: string, clientName: string, clientSlug: string): string {
  const [y, m] = monthYm.split("-");
  const slug = (clientSlug || slugify(clientName)).toUpperCase().slice(0, 12);
  return `USI-${y}${m}-${slug}`;
}

/** Issue + due dates: issued first day of the FOLLOWING month, net-30. */
function issueAndDue(monthEnd: string): { issue: string; due: string } {
  const end = new Date(`${monthEnd}T00:00:00Z`);
  const issue = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  const due = new Date(issue);
  due.setUTCDate(due.getUTCDate() + 30);
  return {
    issue: issue.toISOString().slice(0, 10),
    due: due.toISOString().slice(0, 10),
  };
}

const isMicrosoftVendor = (name: string | null | undefined) =>
  !!name && /^microsoft\b/i.test(name.trim());

export async function GET(
  req: Request,
  ctxArg: { params: Promise<{ id: string }> },
) {
  const { id } = await ctxArg.params;
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? thisYearMonth();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const ctx = await requireContext();
  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) return new Response("Client not found", { status: 404 });

  // 1. Per-tier counts (heartbeat math, NoC excluded, live floor applied).
  const hb = await getMonthlyHeartbeatCounts(
    ctx.organization.id,
    client.id,
    monthStart,
    monthEnd,
  );
  const tierCounts = {
    full_compute_node: hb.counts.fullCompute,
    kiosk_node: hb.counts.kiosk,
    virtual_machine_node: hb.counts.virtualMachine,
    managed_mobile_device: hb.counts.managedMobile,
  };
  const baseline = client.supportBaselineCents ?? 0;
  const rateFullCompute = client.supportRateFullComputeCents ?? 0;
  const rateKiosk = client.supportRateKioskCents ?? 0;
  const rateVm = client.supportRateVmCents ?? 0;
  const rateManagedMobile = client.supportRateManagedMobileCents ?? 0;
  const rateAdditionalUser = client.supportRateAdditionalUserCents ?? 0;
  const additionalUserCount = hb.counts.additionalUsers;

  const supportLines: InvoiceSupportLine[] = [];
  if (baseline > 0) {
    supportLines.push({
      label: "Monthly support baseline",
      qty: 1,
      rateCents: baseline,
      subtotalCents: baseline,
    });
  }
  if (rateFullCompute > 0 || tierCounts.full_compute_node > 0) {
    supportLines.push({
      label: "Full Compute Node",
      hint: "Workstations / laptops / servers",
      qty: tierCounts.full_compute_node,
      rateCents: rateFullCompute,
      subtotalCents: rateFullCompute * tierCounts.full_compute_node,
    });
  }
  if (rateKiosk > 0 || tierCounts.kiosk_node > 0) {
    supportLines.push({
      label: "Kiosk Node",
      hint: "POS / signage / single-purpose stations",
      qty: tierCounts.kiosk_node,
      rateCents: rateKiosk,
      subtotalCents: rateKiosk * tierCounts.kiosk_node,
    });
  }
  if (rateVm > 0 || tierCounts.virtual_machine_node > 0) {
    supportLines.push({
      label: "Virtual Machine Node",
      hint: "VMs on a shared host",
      qty: tierCounts.virtual_machine_node,
      rateCents: rateVm,
      subtotalCents: rateVm * tierCounts.virtual_machine_node,
    });
  }
  if (rateManagedMobile > 0 || tierCounts.managed_mobile_device > 0) {
    supportLines.push({
      label: "Managed Mobile Device",
      hint: "Phones / tablets in MDM",
      qty: tierCounts.managed_mobile_device,
      rateCents: rateManagedMobile,
      subtotalCents: rateManagedMobile * tierCounts.managed_mobile_device,
    });
  }
  if (rateAdditionalUser > 0 || additionalUserCount > 0) {
    supportLines.push({
      label: "Additional Users",
      hint: "Users without hardware (shared mailbox-only, etc.)",
      qty: additionalUserCount,
      rateCents: rateAdditionalUser,
      subtotalCents: rateAdditionalUser * additionalUserCount,
    });
  }
  const supportTotalCents = supportLines.reduce((s, l) => s + l.subtotalCents, 0);

  // 2. Licenses (Microsoft vs. third-party split).
  const activeLicenses = await db
    .select({
      license: licenses,
      vendorName: vendors.name,
    })
    .from(licenses)
    .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
    .where(and(eq(licenses.clientId, client.id), eq(licenses.status, "active")))
    .orderBy(asc(licenses.productName));
  const licensesWithRate = activeLicenses.filter(
    (l) => (l.license.rebillRateCents ?? 0) > 0,
  );
  const microsoftLicenses: InvoiceLicenseLine[] = licensesWithRate
    .filter((l) => isMicrosoftVendor(l.vendorName))
    .map((l) => ({
      productName: l.license.productName,
      vendorName: l.vendorName,
      seats: l.license.seatsTotal,
      rebillCents: l.license.rebillRateCents ?? 0,
    }));
  const thirdPartyLicenses: InvoiceLicenseLine[] = licensesWithRate
    .filter((l) => !isMicrosoftVendor(l.vendorName))
    .map((l) => ({
      productName: l.license.productName,
      vendorName: l.vendorName,
      seats: l.license.seatsTotal,
      rebillCents: l.license.rebillRateCents ?? 0,
    }));
  const microsoftTotalCents = microsoftLicenses.reduce((s, l) => s + l.rebillCents, 0);
  let thirdPartyTotalCents = thirdPartyLicenses.reduce(
    (s, l) => s + l.rebillCents,
    0,
  );

  // 2c. Integration-sourced third-party rebills — BD / Liongard /
  // TitanHQ / Syncro Remote. Mirrors the on-screen statement: rate is
  // the per-seat amount from clients.rebill_rate_<vendor>_cents,
  // quantity is the latest vendor seat snapshot, total = qty × rate.
  // Skipped when rate is NULL/0 or no snapshot data exists.
  const snapshotRows = await db
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
        eq(vendorSeatSnapshots.organizationId, ctx.organization.id),
        eq(vendorSeatSnapshots.clientId, client.id),
      ),
    )
    .groupBy(vendorConnections.kind, vendorSeatSnapshots.productSku);
  const maxSeatsForFamily = (
    kindNeedle: string,
    skuNeedle: string | null = null,
  ): number =>
    snapshotRows
      .filter((r) => r.kind.includes(kindNeedle))
      .filter((r) => (skuNeedle ? r.productSku.includes(skuNeedle) : true))
      .reduce((m, r) => Math.max(m, r.seats ?? 0), 0);
  const candidates: Array<{
    productName: string;
    vendorName: string;
    seats: number;
    perSeatCents: number;
  }> = [
    {
      productName: "Bitdefender GravityZone Secure Plus Bundle",
      vendorName: "Bitdefender",
      seats: maxSeatsForFamily("bitdefender"),
      perSeatCents: client.rebillRateBitdefenderCents ?? 0,
    },
    {
      productName: "Liongard Asset Inventory",
      vendorName: "Liongard",
      seats: maxSeatsForFamily("liongard"),
      perSeatCents: client.rebillRateLiongardCents ?? 0,
    },
    {
      productName: "TitanHQ Plus Cybersecurity Platform",
      vendorName: "TitanHQ",
      seats: maxSeatsForFamily("titanhq", "active"),
      perSeatCents: client.rebillRateTitanhqCents ?? 0,
    },
    {
      productName: "Syncro Remote Access",
      vendorName: "Syncro",
      seats: maxSeatsForFamily("syncro", "remote"),
      perSeatCents: client.rebillRateSyncroRemoteCents ?? 0,
    },
  ];
  for (const c of candidates) {
    if (c.perSeatCents <= 0 || c.seats <= 0) continue;
    const amount = c.perSeatCents * c.seats;
    thirdPartyLicenses.push({
      // Encode the per-seat rate in the product name so the printed
      // invoice still shows the math even though the table only has
      // 4 columns.
      productName: `${c.productName} ($${(c.perSeatCents / 100).toFixed(2)}/seat)`,
      vendorName: c.vendorName,
      seats: c.seats,
      rebillCents: amount,
    });
    thirdPartyTotalCents += amount;
  }

  // 3. Recurring services (USI-paid only).
  const activeServices = await db
    .select({
      service: services,
      vendorName: vendors.name,
    })
    .from(services)
    .leftJoin(vendors, eq(services.vendorId, vendors.id))
    .where(
      and(
        eq(services.clientId, client.id),
        eq(services.status, "active"),
        eq(services.paidBy, "usi"),
      ),
    )
    .orderBy(asc(services.name));
  const servicesLines: InvoiceServiceLine[] = activeServices
    .filter((s) => (s.service.monthlyRebillRateCents ?? 0) > 0)
    .map((s) => ({
      name: s.service.name,
      vendorName: s.vendorName,
      monthlyRebillCents: s.service.monthlyRebillRateCents ?? 0,
    }));
  const servicesTotalCents = servicesLines.reduce(
    (s, x) => s + x.monthlyRebillCents,
    0,
  );

  // 4. Variable billables for this month (period_start within month, not voided).
  const monthBillables = await db
    .select()
    .from(billables)
    .where(
      and(
        eq(billables.clientId, client.id),
        gte(billables.periodStart, monthStart),
        lte(billables.periodStart, monthEnd),
        or(isNull(billables.status), ne(billables.status, "voided")),
      ),
    )
    .orderBy(asc(billables.createdAt));
  const variableLines: InvoiceVariableLine[] = monthBillables.map((b) => ({
    description: b.description,
    rebillCents: b.rebillCents,
  }));
  const variableTotalCents = variableLines.reduce((s, l) => s + l.rebillCents, 0);

  const grandTotalCents =
    supportTotalCents +
    microsoftTotalCents +
    thirdPartyTotalCents +
    servicesTotalCents +
    variableTotalCents;

  const { issue, due } = issueAndDue(monthEnd);
  const invNo = invoiceNumber(month, client.name, client.slug);

  const buf = await buildClientInvoiceDocx({
    clientName: client.name,
    primaryDomain: client.primaryDomain,
    monthLabel: monthLabel(month),
    monthStart,
    monthEnd,
    invoiceNumber: invNo,
    issueDate: issue,
    dueDate: due,
    countingMethod: hb.source,
    flooredUp: hb.flooredUp,
    supportLines,
    supportTotalCents,
    microsoftLicenses,
    microsoftTotalCents,
    thirdPartyLicenses,
    thirdPartyTotalCents,
    services: servicesLines,
    servicesTotalCents,
    variableCharges: variableLines,
    variableTotalCents,
    grandTotalCents,
  });

  const filename = `${invNo}-${slugify(client.name)}.docx`;
  return new Response(new Uint8Array(buf).buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
