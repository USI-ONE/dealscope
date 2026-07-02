/**
 * Admin command-center rollup — one row per client with the metrics
 * the owner needs to manage the whole portfolio at a glance.
 *
 * Designed to avoid N+1: pulls each underlying table once, groups in
 * memory, joins back to the client list. For our scale (~20 clients,
 * ~1000 devices) this stays well under 100ms.
 */
import "server-only";
import { and, desc, eq, isNull, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clientObservations,
  clientProcedures,
  clientRecurringTasks,
  clients,
  domains,
  hardware,
  licenses,
  services,
} from "@/db/schema";
import { classifyDeviceRisk, type HardwareForRisk } from "@/lib/devices/at-risk";

export type AdminClientRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  primaryDomain: string | null;
  industry: string | null;
  syncroCustomerId: string | null;
  monthlyRecurringCents: number | null;
  archived: boolean;
  /** Latest CSAT score (1-5) if Syncro has it. */
  latestCsat: number | null;
  /** AutoElevate value on the customer record (per-customer, separate
   *  from per-device coverage % below). */
  autoelevateClient: string | null;

  /** ---- Hardware risk roll-up ---- */
  activeHardware: number;
  criticalDevices: number;
  warningDevices: number;
  infoDevices: number;
  /** Coverage % across active billable hardware (i.e. excluding NoC). */
  aeRunning: number; aeTotal: number;
  intuneEnrolled: number; intuneTotal: number;
  entraJoined: number; entraTotal: number;
  threatlockerRunning: number; tlTotal: number;

  /** ---- Operational ---- */
  openObservations: number;
  staleHardware14d: number;
  proceduresCount: number;
  overdueRecurringTasks: number;

  /** ---- Audit (Rachel's rock) ---- */
  auditableItems: number;
  auditedItems: number;
  validatedItems: number;
  billableItems: number;
  reconciledBillable: number;
  withRenewalDate: number;
  /** Items with a renewal in the next 30 days (across licenses + services
   *  + domains). */
  renewingSoon: number;
};

export type AdminTotals = {
  clients: number;
  activeHardware: number;
  criticalDevices: number;
  warningDevices: number;
  renewingSoon: number;
  openObservations: number;
  monthlyRecurringCents: number;
  auditedPct: number;          // 0..100
  reconciledPct: number;       // 0..100
  withRenewalDatePct: number;  // 0..100
};

const isYes = (v: string | null) =>
  !!v && /^(yes|true|1|running)$/i.test(v.trim());
const isNo = (v: string | null) =>
  !!v && /^(no|false|0|not running)$/i.test(v.trim());

export async function loadAdminRollup(
  organizationId: string,
): Promise<{ rows: AdminClientRow[]; totals: AdminTotals }> {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const staleCutoff = new Date(Date.now() - 14 * 86_400_000);

  const [
    clientRows,
    hardwareRows,
    obsCounts,
    procCounts,
    overdueCounts,
    licenseStats,
    serviceStats,
    domainStats,
    licenseRenewals,
    serviceRenewals,
    domainRenewals,
  ] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(eq(clients.organizationId, organizationId))
      .orderBy(desc(clients.status), clients.name),

    db
      .select({
        clientId: hardware.clientId,
        status: hardware.status,
        osName: hardware.osName,
        osVersion: hardware.osVersion,
        isEol: hardware.isEol,
        eolDate: hardware.eolDate,
        warrantyEndsAt: hardware.warrantyEndsAt,
        lastSeenAt: hardware.lastSeenAt,
        windows11Readiness: hardware.windows11Readiness,
        intuneEnrolled: hardware.intuneEnrolled,
        entraJoined: hardware.entraJoined,
        autoelevateStatus: hardware.autoelevateStatus,
        threatlockerRunning: hardware.threatlockerRunning,
        notOnContract: hardware.notOnContract,
      })
      .from(hardware)
      .where(eq(hardware.organizationId, organizationId)),

    db
      .select({
        clientId: clientObservations.clientId,
        n: sql<number>`count(*)::int`.as("n"),
      })
      .from(clientObservations)
      .where(
        and(
          eq(clientObservations.organizationId, organizationId),
          sql`${clientObservations.status} NOT IN ('resolved','wont_fix')`,
        ),
      )
      .groupBy(clientObservations.clientId),

    db
      .select({
        clientId: clientProcedures.clientId,
        n: sql<number>`count(*)::int`.as("n"),
      })
      .from(clientProcedures)
      .where(
        and(
          eq(clientProcedures.organizationId, organizationId),
          isNull(clientProcedures.archivedAt),
        ),
      )
      .groupBy(clientProcedures.clientId),

    db
      .select({
        clientId: clientRecurringTasks.clientId,
        n: sql<number>`count(*)::int`.as("n"),
      })
      .from(clientRecurringTasks)
      .where(
        and(
          eq(clientRecurringTasks.organizationId, organizationId),
          isNull(clientRecurringTasks.archivedAt),
          sql`${clientRecurringTasks.nextDueAt} < now()`,
        ),
      )
      .groupBy(clientRecurringTasks.clientId),

    db
      .select({
        clientId: licenses.clientId,
        items: sql<number>`count(*)::int`.as("items"),
        audited: sql<number>`count(*) filter (where ${licenses.auditedAt} is not null)::int`.as("audited"),
        validated: sql<number>`count(*) filter (where ${licenses.validatedAt} is not null)::int`.as("validated"),
        billable: sql<number>`count(*) filter (where coalesce(${licenses.rebillRateCents},0) > 0)::int`.as("billable"),
        reconciled: sql<number>`count(*) filter (where coalesce(${licenses.rebillRateCents},0) > 0 and ${licenses.billingReconciledAt} is not null)::int`.as("reconciled"),
        withRenewal: sql<number>`count(*) filter (where ${licenses.renewalDate} is not null)::int`.as("withRenewal"),
      })
      .from(licenses)
      .where(
        and(
          eq(licenses.organizationId, organizationId),
          eq(licenses.status, "active"),
        ),
      )
      .groupBy(licenses.clientId),

    db
      .select({
        clientId: services.clientId,
        items: sql<number>`count(*)::int`.as("items"),
        audited: sql<number>`count(*) filter (where ${services.auditedAt} is not null)::int`.as("audited"),
        validated: sql<number>`count(*) filter (where ${services.validatedAt} is not null)::int`.as("validated"),
        billable: sql<number>`count(*) filter (where ${services.paidBy} = 'usi' and coalesce(${services.monthlyRebillRateCents},0) > 0)::int`.as("billable"),
        reconciled: sql<number>`count(*) filter (where ${services.paidBy} = 'usi' and coalesce(${services.monthlyRebillRateCents},0) > 0 and ${services.billingReconciledAt} is not null)::int`.as("reconciled"),
        withRenewal: sql<number>`count(*) filter (where ${services.renewalDate} is not null)::int`.as("withRenewal"),
      })
      .from(services)
      .where(
        and(
          eq(services.organizationId, organizationId),
          eq(services.status, "active"),
        ),
      )
      .groupBy(services.clientId),

    db
      .select({
        clientId: domains.clientId,
        items: sql<number>`count(*)::int`.as("items"),
        audited: sql<number>`count(*) filter (where ${domains.auditedAt} is not null)::int`.as("audited"),
        validated: sql<number>`count(*) filter (where ${domains.validatedAt} is not null)::int`.as("validated"),
        billable: sql<number>`count(*) filter (where ${domains.billable})::int`.as("billable"),
        reconciled: sql<number>`count(*) filter (where ${domains.billable} and ${domains.billingReconciledAt} is not null)::int`.as("reconciled"),
        withRenewal: sql<number>`count(*) filter (where ${domains.expiresAt} is not null)::int`.as("withRenewal"),
      })
      .from(domains)
      .where(eq(domains.organizationId, organizationId))
      .groupBy(domains.clientId),

    db
      .select({
        clientId: licenses.clientId,
        n: sql<number>`count(*)::int`.as("n"),
      })
      .from(licenses)
      .where(
        and(
          eq(licenses.organizationId, organizationId),
          eq(licenses.status, "active"),
          gte(licenses.renewalDate, today),
          lte(licenses.renewalDate, in30),
        ),
      )
      .groupBy(licenses.clientId),

    db
      .select({
        clientId: services.clientId,
        n: sql<number>`count(*)::int`.as("n"),
      })
      .from(services)
      .where(
        and(
          eq(services.organizationId, organizationId),
          eq(services.status, "active"),
          gte(services.renewalDate, today),
          lte(services.renewalDate, in30),
        ),
      )
      .groupBy(services.clientId),

    db
      .select({
        clientId: domains.clientId,
        n: sql<number>`count(*)::int`.as("n"),
      })
      .from(domains)
      .where(
        and(
          eq(domains.organizationId, organizationId),
          gte(domains.expiresAt, today),
          lte(domains.expiresAt, in30),
        ),
      )
      .groupBy(domains.clientId),
  ]);

  // Bucket hardware in JS — the risk classifier needs per-row logic.
  const hwByClient = new Map<
    string,
    {
      active: number;
      stale14d: number;
      critical: number;
      warning: number;
      info: number;
      ae: { yes: number; total: number };
      intune: { yes: number; total: number };
      entra: { yes: number; total: number };
      tl: { yes: number; total: number };
    }
  >();
  for (const h of hardwareRows) {
    const bucket =
      hwByClient.get(h.clientId) ??
      {
        active: 0,
        stale14d: 0,
        critical: 0,
        warning: 0,
        info: 0,
        ae: { yes: 0, total: 0 },
        intune: { yes: 0, total: 0 },
        entra: { yes: 0, total: 0 },
        tl: { yes: 0, total: 0 },
      };
    if (h.status === "active") {
      bucket.active++;
      if (
        h.lastSeenAt &&
        new Date(h.lastSeenAt).getTime() < staleCutoff.getTime()
      ) {
        bucket.stale14d++;
      }
      // Risk classifier
      const flags = classifyDeviceRisk(h as HardwareForRisk);
      if (flags.some((f) => f.severity === "critical")) bucket.critical++;
      else if (flags.some((f) => f.severity === "warning")) bucket.warning++;
      else if (flags.some((f) => f.severity === "info")) bucket.info++;
      // Agent coverage — only count devices that DON'T have notOnContract=1
      const billable = h.notOnContract !== "1";
      const tally = (
        target: { yes: number; total: number },
        v: string | null,
      ) => {
        if (!billable) return;
        if (isYes(v) || isNo(v)) {
          target.total++;
          if (isYes(v)) target.yes++;
        }
      };
      tally(bucket.ae, h.autoelevateStatus);
      tally(bucket.intune, h.intuneEnrolled);
      tally(bucket.entra, h.entraJoined);
      tally(bucket.tl, h.threatlockerRunning);
    }
    hwByClient.set(h.clientId, bucket);
  }

  const obsByClient = new Map(obsCounts.map((r) => [r.clientId, r.n]));
  const procByClient = new Map(procCounts.map((r) => [r.clientId, r.n]));
  const overdueByClient = new Map(overdueCounts.map((r) => [r.clientId, r.n]));
  const renewByClient = new Map<string, number>();
  for (const r of licenseRenewals) renewByClient.set(r.clientId!, (renewByClient.get(r.clientId!) ?? 0) + r.n);
  for (const r of serviceRenewals) renewByClient.set(r.clientId!, (renewByClient.get(r.clientId!) ?? 0) + r.n);
  for (const r of domainRenewals) renewByClient.set(r.clientId, (renewByClient.get(r.clientId) ?? 0) + r.n);

  const auditByClient = new Map<
    string,
    {
      items: number;
      audited: number;
      validated: number;
      billable: number;
      reconciled: number;
      withRenewal: number;
    }
  >();
  const fold = (
    arr: typeof licenseStats,
    clientKey: "clientId",
  ) => {
    for (const r of arr) {
      const cid = r[clientKey] as string | null;
      if (!cid) continue;
      const cur = auditByClient.get(cid) ?? {
        items: 0,
        audited: 0,
        validated: 0,
        billable: 0,
        reconciled: 0,
        withRenewal: 0,
      };
      cur.items += r.items;
      cur.audited += r.audited;
      cur.validated += r.validated;
      cur.billable += r.billable;
      cur.reconciled += r.reconciled;
      cur.withRenewal += r.withRenewal;
      auditByClient.set(cid, cur);
    }
  };
  fold(licenseStats, "clientId");
  fold(serviceStats, "clientId");
  fold(domainStats, "clientId");

  const rows: AdminClientRow[] = clientRows.map((c) => {
    const hw = hwByClient.get(c.id);
    const audit = auditByClient.get(c.id) ?? {
      items: 0,
      audited: 0,
      validated: 0,
      billable: 0,
      reconciled: 0,
      withRenewal: 0,
    };
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      status: c.status,
      primaryDomain: c.primaryDomain,
      industry: c.industry,
      syncroCustomerId: c.syncroCustomerId,
      monthlyRecurringCents: c.monthlyRecurringCents,
      archived: !!c.archivedAt,
      latestCsat: c.latestCsat,
      autoelevateClient: c.autoelevateStatus,
      activeHardware: hw?.active ?? 0,
      criticalDevices: hw?.critical ?? 0,
      warningDevices: hw?.warning ?? 0,
      infoDevices: hw?.info ?? 0,
      aeRunning: hw?.ae.yes ?? 0,
      aeTotal: hw?.ae.total ?? 0,
      intuneEnrolled: hw?.intune.yes ?? 0,
      intuneTotal: hw?.intune.total ?? 0,
      entraJoined: hw?.entra.yes ?? 0,
      entraTotal: hw?.entra.total ?? 0,
      threatlockerRunning: hw?.tl.yes ?? 0,
      tlTotal: hw?.tl.total ?? 0,
      openObservations: obsByClient.get(c.id) ?? 0,
      staleHardware14d: hw?.stale14d ?? 0,
      proceduresCount: procByClient.get(c.id) ?? 0,
      overdueRecurringTasks: overdueByClient.get(c.id) ?? 0,
      auditableItems: audit.items,
      auditedItems: audit.audited,
      validatedItems: audit.validated,
      billableItems: audit.billable,
      reconciledBillable: audit.reconciled,
      withRenewalDate: audit.withRenewal,
      renewingSoon: renewByClient.get(c.id) ?? 0,
    };
  });

  // Org-wide totals
  const totalAuditable = rows.reduce((s, r) => s + r.auditableItems, 0);
  const totalAudited = rows.reduce((s, r) => s + r.auditedItems, 0);
  const totalBillable = rows.reduce((s, r) => s + r.billableItems, 0);
  const totalReconciled = rows.reduce((s, r) => s + r.reconciledBillable, 0);
  const totalWithRenewal = rows.reduce((s, r) => s + r.withRenewalDate, 0);

  const totals: AdminTotals = {
    clients: rows.length,
    activeHardware: rows.reduce((s, r) => s + r.activeHardware, 0),
    criticalDevices: rows.reduce((s, r) => s + r.criticalDevices, 0),
    warningDevices: rows.reduce((s, r) => s + r.warningDevices, 0),
    renewingSoon: rows.reduce((s, r) => s + r.renewingSoon, 0),
    openObservations: rows.reduce((s, r) => s + r.openObservations, 0),
    monthlyRecurringCents: rows.reduce(
      (s, r) => s + (r.monthlyRecurringCents ?? 0),
      0,
    ),
    auditedPct:
      totalAuditable > 0 ? Math.round((totalAudited / totalAuditable) * 100) : 0,
    reconciledPct:
      totalBillable > 0
        ? Math.round((totalReconciled / totalBillable) * 100)
        : 0,
    withRenewalDatePct:
      totalAuditable > 0
        ? Math.round((totalWithRenewal / totalAuditable) * 100)
        : 0,
  };

  return { rows, totals };
}
