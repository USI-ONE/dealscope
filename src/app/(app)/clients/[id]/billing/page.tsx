import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, isNull, lte, ne, or, sql } from "drizzle-orm";
import { ChevronLeft, Download } from "lucide-react";
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
import { canCtx, requireContext } from "@/lib/auth-helpers";
import { getMonthlyHeartbeatCounts } from "@/lib/billing/heartbeats";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PrintButton } from "@/components/finance/print-button";

export const metadata = { title: "Monthly statement" };

const fmtUsd = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

export default async function ClientBillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const month = sp.month ?? thisYearMonth();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);

  const ctx = await requireContext();
  const canSeeFinance = canCtx("read", "finance", ctx);

  // Note: the Statement is visible to managers/owners (operational visibility).
  // Cost-basis columns are stripped if the user lacks finance access.
  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) notFound();

  // 1. Per-tier billing — uses the DISTINCT-DEVICE COUNT across the
  // month (every hardware row that heart-beat at least once during the
  // billing period counts, grouped by tier). The cron at
  // /api/cron/snapshot-tiers writes one heartbeat row per (device,
  // day) — sourced from Syncro's RMM updated_at signal within ~36h,
  // plus an unconditional row for manually-tracked active hardware.
  //
  // If heartbeat coverage of the month is incomplete (the rollout
  // month, or brand-new clients), the helper falls back to the legacy
  // high-water-mark math automatically and reports `source: "fallback"`
  // — the UI shows a tag so finance knows what was used.
  const hb = await getMonthlyHeartbeatCounts(
    ctx.organization.id,
    client.id,
    monthStart,
    monthEnd,
  );
  const hwm = hb.counts;
  const tierCounts = {
    full_compute_node: hwm.fullCompute,
    kiosk_node: hwm.kiosk,
    virtual_machine_node: hwm.virtualMachine,
    managed_mobile_device: hwm.managedMobile,
  };
  const baseline = client.supportBaselineCents ?? 0;
  const rateFullCompute = client.supportRateFullComputeCents ?? 0;
  const rateKiosk = client.supportRateKioskCents ?? 0;
  const rateVm = client.supportRateVmCents ?? 0;
  const rateManagedMobile = client.supportRateManagedMobileCents ?? 0;
  const rateAdditionalUser = client.supportRateAdditionalUserCents ?? 0;
  // Additional users — also high-water mark.
  const additionalUserCount = hwm.additionalUsers;

  const supportLines: { label: string; hint: string; qty: number; rateCents: number; subtotal: number }[] = [];
  if (baseline > 0) {
    supportLines.push({
      label: "Monthly support baseline",
      hint: "",
      qty: 1,
      rateCents: baseline,
      subtotal: baseline,
    });
  }
  if (rateFullCompute > 0 || tierCounts.full_compute_node > 0) {
    supportLines.push({
      label: "Full Compute Node",
      hint: "Workstations / laptops / servers",
      qty: tierCounts.full_compute_node,
      rateCents: rateFullCompute,
      subtotal: rateFullCompute * tierCounts.full_compute_node,
    });
  }
  if (rateKiosk > 0 || tierCounts.kiosk_node > 0) {
    supportLines.push({
      label: "Kiosk Node",
      hint: "POS / signage / single-purpose stations",
      qty: tierCounts.kiosk_node,
      rateCents: rateKiosk,
      subtotal: rateKiosk * tierCounts.kiosk_node,
    });
  }
  if (rateVm > 0 || tierCounts.virtual_machine_node > 0) {
    supportLines.push({
      label: "Virtual Machine Node",
      hint: "VMs on a shared host",
      qty: tierCounts.virtual_machine_node,
      rateCents: rateVm,
      subtotal: rateVm * tierCounts.virtual_machine_node,
    });
  }
  if (rateManagedMobile > 0 || tierCounts.managed_mobile_device > 0) {
    supportLines.push({
      label: "Managed Mobile Device",
      hint: "Phones / tablets in MDM",
      qty: tierCounts.managed_mobile_device,
      rateCents: rateManagedMobile,
      subtotal: rateManagedMobile * tierCounts.managed_mobile_device,
    });
  }
  if (rateAdditionalUser > 0 || additionalUserCount > 0) {
    supportLines.push({
      label: "Additional Users",
      hint: "Users without hardware (shared mailbox-only, etc.)",
      qty: additionalUserCount,
      rateCents: rateAdditionalUser,
      subtotal: rateAdditionalUser * additionalUserCount,
    });
  }
  const supportTotalCents = supportLines.reduce((s, l) => s + l.subtotal, 0);

  // 2. Active license rebills.
  const activeLicenses = await db
    .select({
      license: licenses,
      vendorName: vendors.name,
    })
    .from(licenses)
    .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
    .where(
      and(
        eq(licenses.clientId, client.id),
        eq(licenses.status, "active"),
      ),
    )
    .orderBy(asc(licenses.productName));
  const licensesWithRate = activeLicenses.filter(
    (l) => (l.license.rebillRateCents ?? 0) > 0,
  );
  const licensesTotalCents = licensesWithRate.reduce(
    (sum, l) => sum + (l.license.rebillRateCents ?? 0),
    0,
  );
  // Split for the statement: Microsoft licenses are listed separately so
  // the client sees their M365 footprint distinct from other ISVs.
  const isMicrosoftVendor = (name: string | null | undefined) =>
    !!name && /^microsoft\b/i.test(name.trim());
  const microsoftLicenses = licensesWithRate.filter((l) =>
    isMicrosoftVendor(l.vendorName),
  );
  const thirdPartyLicenses = licensesWithRate.filter(
    (l) => !isMicrosoftVendor(l.vendorName),
  );
  const microsoftTotalCents = microsoftLicenses.reduce(
    (sum, l) => sum + (l.license.rebillRateCents ?? 0),
    0,
  );
  const thirdPartyTotalCents = thirdPartyLicenses.reduce(
    (sum, l) => sum + (l.license.rebillRateCents ?? 0),
    0,
  );

  // 2c. Per-client integration rebills — BD / Liongard / TitanHQ /
  // Syncro Remote rates set on /clients/[id] in the "Third-party
  // rebill rates" card × the latest active-seat snapshot per family.
  // Renders as additional rows in the Third-party licenses section
  // and feeds the same subtotal + grand total. Skipped silently when
  // the operator hasn't set a rate (NULL or 0) for that vendor.
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

  type IntegrationRebillLine = {
    productName: string;
    vendorName: string;
    seats: number;
    unitRateCents: number;
    amountCents: number;
  };
  const integrationRebills: IntegrationRebillLine[] = [];
  const pushIfBillable = (line: IntegrationRebillLine) => {
    if (line.unitRateCents > 0 && line.seats > 0) {
      integrationRebills.push(line);
    }
  };
  pushIfBillable({
    productName: "Bitdefender GravityZone Secure Plus Bundle",
    vendorName: "Bitdefender",
    seats: maxSeatsForFamily("bitdefender"),
    unitRateCents: client.rebillRateBitdefenderCents ?? 0,
    amountCents:
      (client.rebillRateBitdefenderCents ?? 0) * maxSeatsForFamily("bitdefender"),
  });
  pushIfBillable({
    productName: "Liongard Asset Inventory",
    vendorName: "Liongard",
    seats: maxSeatsForFamily("liongard"),
    unitRateCents: client.rebillRateLiongardCents ?? 0,
    amountCents:
      (client.rebillRateLiongardCents ?? 0) * maxSeatsForFamily("liongard"),
  });
  pushIfBillable({
    productName: "TitanHQ Plus Cybersecurity Platform",
    vendorName: "TitanHQ",
    seats: maxSeatsForFamily("titanhq", "active"),
    unitRateCents: client.rebillRateTitanhqCents ?? 0,
    amountCents:
      (client.rebillRateTitanhqCents ?? 0) *
      maxSeatsForFamily("titanhq", "active"),
  });
  pushIfBillable({
    productName: "Syncro Remote Access",
    vendorName: "Syncro",
    seats: maxSeatsForFamily("syncro", "remote"),
    unitRateCents: client.rebillRateSyncroRemoteCents ?? 0,
    amountCents:
      (client.rebillRateSyncroRemoteCents ?? 0) *
      maxSeatsForFamily("syncro", "remote"),
  });
  const integrationRebillTotalCents = integrationRebills.reduce(
    (sum, l) => sum + l.amountCents,
    0,
  );
  // Roll the integration rebills into the same third-party subtotal so
  // the grand-total math stays consistent with the invoice generator.
  const thirdPartySubtotalCents =
    thirdPartyTotalCents + integrationRebillTotalCents;

  // 3. Active service rebills (USI-paid only — client-direct services live
  // in the client services card for reference but never appear here).
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
  const servicesWithRate = activeServices.filter(
    (s) => (s.service.monthlyRebillRateCents ?? 0) > 0,
  );
  const servicesTotalCents = servicesWithRate.reduce(
    (sum, s) => sum + (s.service.monthlyRebillRateCents ?? 0),
    0,
  );

  // 4. Variable billables for this month.
  const monthBillables = await db
    .select()
    .from(billables)
    .where(
      and(
        eq(billables.clientId, client.id),
        gte(billables.periodStart, monthStart),
        lte(billables.periodStart, monthEnd),
        // exclude voided billables
        or(isNull(billables.status), ne(billables.status, "voided")),
      ),
    )
    .orderBy(asc(billables.createdAt));
  const billablesTotalCents = monthBillables.reduce((sum, b) => sum + b.rebillCents, 0);
  const billablesCostCents = monthBillables.reduce(
    (sum, b) => sum + b.costBasisCents,
    0,
  );

  const grandTotalCents =
    supportTotalCents +
    licensesTotalCents +
    integrationRebillTotalCents +
    servicesTotalCents +
    billablesTotalCents;

  // Month options
  const opts: string[] = [];
  const now = new Date();
  for (let i = -1; i <= 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    opts.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <Link
          href={`/clients/${client.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to {client.name}
        </Link>
        <div className="flex items-center gap-2">
          <form action={`/clients/${client.id}/billing`} className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Month
            </label>
            <select
              name="month"
              defaultValue={month}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {opts.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
            >
              Apply
            </button>
          </form>
          <a
            href={`/clients/${client.id}/billing/export.docx?month=${month}`}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
            title="Download a customer-facing invoice (.docx) for this period"
          >
            <Download className="size-3.5" /> Download invoice
          </a>
          <PrintButton />
        </div>
      </div>

      <Card className="border-2 print:border-0 print:shadow-none">
        <CardContent className="space-y-8 p-5 sm:p-8 md:p-10">
          {/* Header */}
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Monthly Statement
              </p>
              <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
              {client.primaryDomain && (
                <p className="text-sm text-muted-foreground">{client.primaryDomain}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Period</p>
              <p className="text-lg font-semibold">{monthLabel(month)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {monthStart} → {monthEnd}
              </p>
            </div>
          </header>

          {/* 1. Contracted support */}
          <Section title="Contracted support">
            <p className="-mt-1 text-[11px] text-muted-foreground print:hidden">
              {hb.source === "heartbeats" ? (
                <>
                  Quantities reflect the count of <strong>distinct devices
                  that checked in</strong> at least once during the period
                  (Syncro RMM heartbeat), with today's active-device count
                  as a floor — a device temporarily offline today is still
                  billed if it's <code>status=active</code> in TechOS.
                  Devices flagged <strong>Not on Contract</strong> in
                  Syncro are excluded from every count.
                  Heartbeat coverage: {hb.daysWithData} / {hb.daysInMonth} days.
                  {hb.flooredUp && (
                    <>
                      {" "}
                      <strong>Floor applied</strong> — at least one tier was
                      below today's live count and was raised to match.
                    </>
                  )}
                </>
              ) : hb.source === "fallback" ? (
                <>
                  <strong>Fallback math</strong> — high-water-mark (max
                  active count seen on any snapshot day), floored by
                  today's active-device count. Heartbeat coverage was
                  thin ({hb.daysWithData} / {hb.daysInMonth} days). Once
                  heartbeats cover the full month, the bill switches to
                  the distinct-device count automatically.
                  {hb.flooredUp && (
                    <>
                      {" "}<strong>Floor applied.</strong>
                    </>
                  )}
                </>
              ) : (
                <>
                  <strong>Live counts</strong> — no snapshots or
                  heartbeats yet for this period. Will switch to
                  distinct-device counting once the daily cron has run
                  for a full month.
                </>
              )}
            </p>
            {supportLines.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                Contracted-support rates not configured. Owner / finance can set
                per-tier rates on the client page (Contracted support card).
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2">Component</th>
                    <th className="py-2 text-right">Qty</th>
                    {canSeeFinance && <th className="py-2 text-right">Rate</th>}
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {supportLines.map((line, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2">
                        <div className="font-medium">{line.label}</div>
                        {line.hint && (
                          <div className="text-xs text-muted-foreground">
                            {line.hint}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{line.qty}</td>
                      {canSeeFinance && (
                        <td className="py-2 text-right tabular-nums">
                          {fmtUsd(line.rateCents)}
                        </td>
                      )}
                      <td className="py-2 text-right tabular-nums">
                        {fmtUsd(line.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <td className="py-2 uppercase tracking-wider text-xs">Subtotal</td>
                    <td colSpan={canSeeFinance ? 2 : 1}></td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtUsd(supportTotalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Section>

          {/* 2a. Microsoft licenses */}
          <Section title="Microsoft licenses">
            {microsoftLicenses.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No active Microsoft licenses with a rebill rate set.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2">Product</th>
                    <th className="py-2 text-right">Seats</th>
                    {canSeeFinance && <th className="py-2 text-right">Per seat</th>}
                    <th className="py-2 text-right">Rebill</th>
                  </tr>
                </thead>
                <tbody>
                  {microsoftLicenses.map((l) => {
                    const seats = l.license.seatsTotal ?? 0;
                    const total = l.license.rebillRateCents ?? 0;
                    const perSeat = seats > 0 ? Math.round(total / seats) : 0;
                    return (
                      <tr key={l.license.id} className="border-b">
                        <td className="py-2 font-medium">{l.license.productName}</td>
                        <td className="py-2 text-right tabular-nums">
                          {l.license.seatsTotal ?? "—"}
                        </td>
                        {canSeeFinance && (
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {seats > 0 ? fmtUsd(perSeat) : "—"}
                          </td>
                        )}
                        <td className="py-2 text-right tabular-nums">{fmtUsd(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <td className="py-2 uppercase tracking-wider text-xs">Subtotal</td>
                    <td colSpan={canSeeFinance ? 2 : 1}></td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtUsd(microsoftTotalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Section>

          {/* 2b. Third-party licenses */}
          <Section title="Third-party licenses">
            {thirdPartyLicenses.length === 0 &&
            integrationRebills.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No active third-party licenses with a rebill rate set.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2">Product</th>
                    <th className="py-2">Vendor</th>
                    <th className="py-2 text-right">Seats</th>
                    <th className="py-2 text-right">Rate</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Manual licenses table rows — rebill_rate is a flat
                      monthly amount on these, not per-seat, so we
                      render qty=1 and amount=rate to match how the
                      legacy generator emits them. */}
                  {thirdPartyLicenses.map((l) => (
                    <tr key={l.license.id} className="border-b">
                      <td className="py-2 font-medium">{l.license.productName}</td>
                      <td className="py-2 text-muted-foreground">{l.vendorName ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums">
                        {l.license.seatsTotal ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtUsd(l.license.rebillRateCents ?? 0)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtUsd(l.license.rebillRateCents ?? 0)}
                      </td>
                    </tr>
                  ))}
                  {/* Integration-sourced rebills — driven by the
                      per-client rebill rate columns × the latest
                      vendor seat snapshot. The blue tag distinguishes
                      these from manual license rows so the operator
                      knows where the math came from. */}
                  {integrationRebills.map((line) => (
                    <tr key={`integration_${line.vendorName}_${line.productName}`} className="border-b">
                      <td className="py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{line.productName}</span>
                          <span
                            className="rounded-full border border-blue-500/40 bg-blue-50/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                            title="Driven by per-client rebill rate × latest vendor seat snapshot"
                          >
                            integration
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-muted-foreground">{line.vendorName}</td>
                      <td className="py-2 text-right tabular-nums">{line.seats}</td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtUsd(line.unitRateCents)}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtUsd(line.amountCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <td className="py-2 uppercase tracking-wider text-xs">Subtotal</td>
                    <td colSpan={3}></td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtUsd(thirdPartySubtotalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Section>

          {/* 3. Recurring services */}
          <Section title="Recurring services">
            {servicesWithRate.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No active services with a monthly rebill rate set.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2">Service</th>
                    <th className="py-2">Vendor</th>
                    <th className="py-2 text-right">Monthly rebill</th>
                  </tr>
                </thead>
                <tbody>
                  {servicesWithRate.map((s) => (
                    <tr key={s.service.id} className="border-b">
                      <td className="py-2 font-medium">{s.service.name}</td>
                      <td className="py-2 text-muted-foreground">{s.vendorName ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums">
                        {fmtUsd(s.service.monthlyRebillRateCents ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <td className="py-2 uppercase tracking-wider text-xs">Subtotal</td>
                    <td></td>
                    <td className="py-2 text-right tabular-nums">
                      {fmtUsd(servicesTotalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Section>

          {/* 4. Variable billables (vendor bill allocations for this month) */}
          <Section title={`Variable charges — ${monthLabel(month)}`}>
            {monthBillables.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                No variable charges for this period.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2">Description</th>
                    {canSeeFinance && <th className="py-2 text-right">Cost basis</th>}
                    {canSeeFinance && <th className="py-2 text-right">Markup %</th>}
                    <th className="py-2 text-right">Rebill</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {monthBillables.map((b) => (
                    <tr key={b.id} className="border-b">
                      <td className="py-2">{b.description}</td>
                      {canSeeFinance && (
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {fmtUsd(b.costBasisCents)}
                        </td>
                      )}
                      {canSeeFinance && (
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {b.markupPct}%
                        </td>
                      )}
                      <td className="py-2 text-right tabular-nums">
                        {fmtUsd(b.rebillCents)}
                      </td>
                      <td className="py-2">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {b.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-semibold">
                  <tr>
                    <td className="py-2 uppercase tracking-wider text-xs">Subtotal</td>
                    {canSeeFinance && (
                      <td className="py-2 text-right tabular-nums text-muted-foreground">
                        {fmtUsd(billablesCostCents)}
                      </td>
                    )}
                    {canSeeFinance && <td></td>}
                    <td className="py-2 text-right tabular-nums">
                      {fmtUsd(billablesTotalCents)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Section>

          {/* Grand total */}
          <div className="rounded-lg border-2 bg-muted/20 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                Grand total
              </span>
              <span className="text-3xl font-bold tabular-nums">
                {fmtUsd(grandTotalCents)}
              </span>
            </div>
          </div>

          <footer className="border-t pt-4 text-center text-xs text-muted-foreground">
            Generated {new Date().toLocaleDateString()} · {monthLabel(month)}
          </footer>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}
