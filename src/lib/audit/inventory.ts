/**
 * Unified audit inventory loader.
 *
 * Combines licenses, USI-paid services (subscriptions / accounts), and
 * domains into a single shape so the audit dashboard can compute KPIs
 * against Rachel Wong's licensing rock and surface a single
 * renewables-to-audit list.
 *
 * Rock KPIs supported:
 *   - % audited                       → row.auditedAt set
 *   - % records validated and cleaned → row.validatedAt set
 *   - % active items entered          → 100% by construction (only
 *                                       active items show here)
 *   - % client-billable reconciled    → row.billingReconciledAt set
 *                                       (denominator: rows where the
 *                                       item is billable)
 *   - % renewal dates populated       → row.renewalDate set
 *   - 30-day reminder process         → checked separately via
 *                                       upcomingRenewals()
 */
import "server-only";
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  domains,
  licenses,
  services,
  users,
  memberships,
  vendors,
} from "@/db/schema";

export type AuditItemKind = "license" | "subscription" | "domain";

export type AuditItem = {
  kind: AuditItemKind;
  id: string;
  organizationId: string;
  clientId: string | null;
  clientName: string | null;
  name: string;
  detail: string | null;
  vendorName: string | null;
  renewalDate: string | null;
  autoRenew: boolean | null;
  billable: boolean;
  rebillRateCents: number | null;
  /** Audit lifecycle */
  auditedAt: Date | null;
  validatedAt: Date | null;
  billingReconciledAt: Date | null;
  ownerName: string | null;
  ownerMembershipId: string | null;
};

export type AuditInventory = {
  items: AuditItem[];
  totals: {
    items: number;
    audited: number;
    validated: number;
    billableItems: number;
    billingReconciled: number;
    withRenewalDate: number;
  };
};

/**
 * Pull every renewable / auditable item across the org. Owners + audit
 * stamps come back resolved to human-readable strings.
 */
export async function loadAuditInventory(
  organizationId: string,
): Promise<AuditInventory> {
  const [licRows, svcRows, domRows] = await Promise.all([
    db
      .select({
        license: licenses,
        clientName: clients.name,
        vendorName: vendors.name,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(licenses)
      .leftJoin(clients, eq(licenses.clientId, clients.id))
      .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
      .leftJoin(memberships, eq(licenses.ownerMembershipId, memberships.id))
      .leftJoin(users, eq(memberships.userId, users.id))
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
        clientName: clients.name,
        vendorName: vendors.name,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(services)
      .leftJoin(clients, eq(services.clientId, clients.id))
      .leftJoin(vendors, eq(services.vendorId, vendors.id))
      .leftJoin(memberships, eq(services.ownerMembershipId, memberships.id))
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(services.organizationId, organizationId),
          eq(services.status, "active"),
        ),
      )
      .orderBy(asc(services.name)),
    db
      .select({
        domain: domains,
        clientName: clients.name,
        vendorName: vendors.name,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(domains)
      .leftJoin(clients, eq(domains.clientId, clients.id))
      .leftJoin(vendors, eq(domains.vendorId, vendors.id))
      .leftJoin(memberships, eq(domains.ownerMembershipId, memberships.id))
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(eq(domains.organizationId, organizationId))
      .orderBy(asc(domains.name)),
  ]);

  const items: AuditItem[] = [];

  for (const r of licRows) {
    const isBillable = (r.license.rebillRateCents ?? 0) > 0;
    items.push({
      kind: "license",
      id: r.license.id,
      organizationId: r.license.organizationId,
      clientId: r.license.clientId,
      clientName: r.clientName,
      name: r.license.productName,
      detail: r.license.sku ?? null,
      vendorName: r.vendorName,
      renewalDate: r.license.renewalDate,
      autoRenew: null,
      billable: isBillable,
      rebillRateCents: r.license.rebillRateCents,
      auditedAt: r.license.auditedAt,
      validatedAt: r.license.validatedAt,
      billingReconciledAt: r.license.billingReconciledAt,
      ownerName: r.ownerName ?? r.ownerEmail ?? null,
      ownerMembershipId: r.license.ownerMembershipId,
    });
  }

  for (const r of svcRows) {
    const isBillable =
      r.service.paidBy === "usi" && (r.service.monthlyRebillRateCents ?? 0) > 0;
    items.push({
      kind: "subscription",
      id: r.service.id,
      organizationId: r.service.organizationId,
      clientId: r.service.clientId,
      clientName: r.clientName,
      name: r.service.name,
      detail: r.service.category,
      vendorName: r.vendorName,
      renewalDate: r.service.renewalDate,
      autoRenew: r.service.autoRenew,
      billable: isBillable,
      rebillRateCents: r.service.monthlyRebillRateCents,
      auditedAt: r.service.auditedAt,
      validatedAt: r.service.validatedAt,
      billingReconciledAt: r.service.billingReconciledAt,
      ownerName: r.ownerName ?? r.ownerEmail ?? null,
      ownerMembershipId: r.service.ownerMembershipId,
    });
  }

  for (const r of domRows) {
    items.push({
      kind: "domain",
      id: r.domain.id,
      organizationId: r.domain.organizationId,
      clientId: r.domain.clientId,
      clientName: r.clientName,
      name: r.domain.name,
      detail: r.domain.registrar,
      vendorName: r.vendorName,
      renewalDate: r.domain.expiresAt,
      autoRenew: r.domain.autoRenew,
      billable: r.domain.billable,
      rebillRateCents: r.domain.rebillRateCents,
      auditedAt: r.domain.auditedAt,
      validatedAt: r.domain.validatedAt,
      billingReconciledAt: r.domain.billingReconciledAt,
      ownerName: r.ownerName ?? r.ownerEmail ?? null,
      ownerMembershipId: r.domain.ownerMembershipId,
    });
  }

  // Totals against rock targets.
  const totals = {
    items: items.length,
    audited: items.filter((i) => !!i.auditedAt).length,
    validated: items.filter((i) => !!i.validatedAt).length,
    billableItems: items.filter((i) => i.billable).length,
    billingReconciled: items.filter((i) => i.billable && !!i.billingReconciledAt).length,
    withRenewalDate: items.filter((i) => !!i.renewalDate).length,
  };

  return { items, totals };
}

/**
 * Items whose renewal / expiry falls in the next N days (default 30).
 * Drives the "30-day renewal reminder" UI panel.
 */
export async function upcomingRenewals(
  organizationId: string,
  daysAhead = 30,
): Promise<AuditItem[]> {
  const today = new Date().toISOString().slice(0, 10);
  const ahead = new Date(Date.now() + daysAhead * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [licRows, svcRows, domRows] = await Promise.all([
    db
      .select({
        license: licenses,
        clientName: clients.name,
        vendorName: vendors.name,
      })
      .from(licenses)
      .leftJoin(clients, eq(licenses.clientId, clients.id))
      .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
      .where(
        and(
          eq(licenses.organizationId, organizationId),
          eq(licenses.status, "active"),
          isNotNull(licenses.renewalDate),
          gte(licenses.renewalDate, today),
          lte(licenses.renewalDate, ahead),
        ),
      )
      .orderBy(asc(licenses.renewalDate)),
    db
      .select({
        service: services,
        clientName: clients.name,
        vendorName: vendors.name,
      })
      .from(services)
      .leftJoin(clients, eq(services.clientId, clients.id))
      .leftJoin(vendors, eq(services.vendorId, vendors.id))
      .where(
        and(
          eq(services.organizationId, organizationId),
          eq(services.status, "active"),
          isNotNull(services.renewalDate),
          gte(services.renewalDate, today),
          lte(services.renewalDate, ahead),
        ),
      )
      .orderBy(asc(services.renewalDate)),
    db
      .select({
        domain: domains,
        clientName: clients.name,
        vendorName: vendors.name,
      })
      .from(domains)
      .leftJoin(clients, eq(domains.clientId, clients.id))
      .leftJoin(vendors, eq(domains.vendorId, vendors.id))
      .where(
        and(
          eq(domains.organizationId, organizationId),
          isNotNull(domains.expiresAt),
          gte(domains.expiresAt, today),
          lte(domains.expiresAt, ahead),
        ),
      )
      .orderBy(asc(domains.expiresAt)),
  ]);

  const out: AuditItem[] = [];
  for (const r of licRows) {
    const isBillable = (r.license.rebillRateCents ?? 0) > 0;
    out.push({
      kind: "license",
      id: r.license.id,
      organizationId: r.license.organizationId,
      clientId: r.license.clientId,
      clientName: r.clientName,
      name: r.license.productName,
      detail: r.license.sku ?? null,
      vendorName: r.vendorName,
      renewalDate: r.license.renewalDate,
      autoRenew: null,
      billable: isBillable,
      rebillRateCents: r.license.rebillRateCents,
      auditedAt: r.license.auditedAt,
      validatedAt: r.license.validatedAt,
      billingReconciledAt: r.license.billingReconciledAt,
      ownerName: null,
      ownerMembershipId: r.license.ownerMembershipId,
    });
  }
  for (const r of svcRows) {
    const isBillable =
      r.service.paidBy === "usi" && (r.service.monthlyRebillRateCents ?? 0) > 0;
    out.push({
      kind: "subscription",
      id: r.service.id,
      organizationId: r.service.organizationId,
      clientId: r.service.clientId,
      clientName: r.clientName,
      name: r.service.name,
      detail: r.service.category,
      vendorName: r.vendorName,
      renewalDate: r.service.renewalDate,
      autoRenew: r.service.autoRenew,
      billable: isBillable,
      rebillRateCents: r.service.monthlyRebillRateCents,
      auditedAt: r.service.auditedAt,
      validatedAt: r.service.validatedAt,
      billingReconciledAt: r.service.billingReconciledAt,
      ownerName: null,
      ownerMembershipId: r.service.ownerMembershipId,
    });
  }
  for (const r of domRows) {
    out.push({
      kind: "domain",
      id: r.domain.id,
      organizationId: r.domain.organizationId,
      clientId: r.domain.clientId,
      clientName: r.clientName,
      name: r.domain.name,
      detail: r.domain.registrar,
      vendorName: r.vendorName,
      renewalDate: r.domain.expiresAt,
      autoRenew: r.domain.autoRenew,
      billable: r.domain.billable,
      rebillRateCents: r.domain.rebillRateCents,
      auditedAt: r.domain.auditedAt,
      validatedAt: r.domain.validatedAt,
      billingReconciledAt: r.domain.billingReconciledAt,
      ownerName: null,
      ownerMembershipId: r.domain.ownerMembershipId,
    });
  }
  out.sort((a, b) => (a.renewalDate ?? "").localeCompare(b.renewalDate ?? ""));
  return out;
}
