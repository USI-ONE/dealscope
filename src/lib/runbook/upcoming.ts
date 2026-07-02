/**
 * "Upcoming" aggregator — surfaces every dated obligation we know about
 * across the org so a single dashboard can answer "what's coming up?".
 *
 * Sources:
 *   - License renewal_date
 *   - Vendor contract end (contracts.endsAt)
 *   - App registration secret/cert expiries
 *   - Network circuit term ends
 *   - Service ends_at
 *   - Backup-strategy restore-test cadence (lastRestoreTestAt + cadence)
 *   - User-defined recurring tasks (clientRecurringTasks.nextDueAt)
 */
import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clientAppRegistrations,
  clientBackupStrategy,
  clientNetworkCircuits,
  clientRecurringTasks,
  clients,
  contracts,
  licenses,
  services,
  vendors,
  voiceServices,
} from "@/db/schema";

/** USI rule: every system credential must be re-audited within
 *  CREDENTIAL_AUDIT_INTERVAL_DAYS of the last audit. Used by both the
 *  per-system audit pill and this upcoming feed. */
const CREDENTIAL_AUDIT_INTERVAL_DAYS = 30;

export type UpcomingItemKind =
  | "license_renewal"
  | "contract_end"
  | "app_secret"
  | "app_cert"
  | "circuit_term"
  | "service_end"
  | "restore_test"
  | "recurring_task"
  | "credential_audit";

export type UpcomingItem = {
  id: string;
  kind: UpcomingItemKind;
  dueAt: string; // YYYY-MM-DD
  daysFromToday: number; // negative = overdue
  title: string;
  detail: string | null;
  clientId: string | null;
  clientName: string | null;
  /** Best-effort link back to the source. */
  link: string | null;
};

const CADENCE_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 90,
  semi_annual: 182,
  annual: 365,
  ad_hoc: 0,
  never: 0,
};

function daysFromToday(iso: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setUTCHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function ymd(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export async function getUpcomingItems(
  organizationId: string,
  /** Inclusive window — items dated <= today + windowDays are included.
      Items already overdue are always included. */
  windowDays = 365,
): Promise<UpcomingItem[]> {
  const items: UpcomingItem[] = [];

  // 1. Licenses with renewal dates.
  const licRows = await db
    .select({
      id: licenses.id,
      productName: licenses.productName,
      renewalDate: licenses.renewalDate,
      clientId: licenses.clientId,
      clientName: clients.name,
      vendorName: vendors.name,
      seatsTotal: licenses.seatsTotal,
    })
    .from(licenses)
    .leftJoin(clients, eq(licenses.clientId, clients.id))
    .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
    .where(
      and(
        eq(licenses.organizationId, organizationId),
        eq(licenses.status, "active"),
      ),
    );
  for (const l of licRows) {
    const due = ymd(l.renewalDate);
    if (!due) continue;
    items.push({
      id: `lic-${l.id}`,
      kind: "license_renewal",
      dueAt: due,
      daysFromToday: daysFromToday(due),
      title: l.productName,
      detail: [
        l.vendorName,
        l.seatsTotal ? `${l.seatsTotal} seats` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      clientId: l.clientId,
      clientName: l.clientName,
      link: l.clientId ? `/clients/${l.clientId}` : `/licenses`,
    });
  }

  // 2. Contracts that have an end date.
  const contractRows = await db
    .select({
      id: contracts.id,
      title: contracts.title,
      endsAt: contracts.endsAt,
      clientId: contracts.clientId,
      clientName: clients.name,
      vendorName: vendors.name,
    })
    .from(contracts)
    .leftJoin(clients, eq(contracts.clientId, clients.id))
    .leftJoin(vendors, eq(contracts.vendorId, vendors.id))
    .where(eq(contracts.organizationId, organizationId));
  for (const c of contractRows) {
    const due = ymd(c.endsAt);
    if (!due) continue;
    items.push({
      id: `ctr-${c.id}`,
      kind: "contract_end",
      dueAt: due,
      daysFromToday: daysFromToday(due),
      title: c.title || "Contract",
      detail: c.vendorName,
      clientId: c.clientId,
      clientName: c.clientName,
      link: c.clientId ? `/clients/${c.clientId}` : null,
    });
  }

  // 3. App registration secret + cert expiries.
  const appRows = await db
    .select({
      id: clientAppRegistrations.id,
      displayName: clientAppRegistrations.displayName,
      secretExpiresAt: clientAppRegistrations.secretExpiresAt,
      certExpiresAt: clientAppRegistrations.certExpiresAt,
      clientId: clientAppRegistrations.clientId,
      clientName: clients.name,
    })
    .from(clientAppRegistrations)
    .leftJoin(clients, eq(clientAppRegistrations.clientId, clients.id))
    .where(eq(clientAppRegistrations.organizationId, organizationId));
  for (const a of appRows) {
    const sec = ymd(a.secretExpiresAt);
    if (sec) {
      items.push({
        id: `app-sec-${a.id}`,
        kind: "app_secret",
        dueAt: sec,
        daysFromToday: daysFromToday(sec),
        title: `${a.displayName} (secret expires)`,
        detail: "Entra app registration",
        clientId: a.clientId,
        clientName: a.clientName,
        link: a.clientId ? `/clients/${a.clientId}` : null,
      });
    }
    const cert = ymd(a.certExpiresAt);
    if (cert) {
      items.push({
        id: `app-cert-${a.id}`,
        kind: "app_cert",
        dueAt: cert,
        daysFromToday: daysFromToday(cert),
        title: `${a.displayName} (cert expires)`,
        detail: "Entra app registration",
        clientId: a.clientId,
        clientName: a.clientName,
        link: a.clientId ? `/clients/${a.clientId}` : null,
      });
    }
  }

  // 4. Network circuit term ends.
  const circRows = await db
    .select({
      id: clientNetworkCircuits.id,
      carrier: clientNetworkCircuits.carrier,
      productLabel: clientNetworkCircuits.productLabel,
      termEndsAt: clientNetworkCircuits.termEndsAt,
      clientId: clientNetworkCircuits.clientId,
      clientName: clients.name,
    })
    .from(clientNetworkCircuits)
    .leftJoin(clients, eq(clientNetworkCircuits.clientId, clients.id))
    .where(eq(clientNetworkCircuits.organizationId, organizationId));
  for (const c of circRows) {
    const due = ymd(c.termEndsAt);
    if (!due) continue;
    items.push({
      id: `cir-${c.id}`,
      kind: "circuit_term",
      dueAt: due,
      daysFromToday: daysFromToday(due),
      title: `${c.carrier} circuit term ends`,
      detail: c.productLabel,
      clientId: c.clientId,
      clientName: c.clientName,
      link: c.clientId ? `/clients/${c.clientId}` : null,
    });
  }

  // 5. Service end dates (paid + tracked).
  const svcRows = await db
    .select({
      id: services.id,
      name: services.name,
      endsAt: services.endsAt,
      clientId: services.clientId,
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
      ),
    );
  for (const s of svcRows) {
    const due = ymd(s.endsAt);
    if (!due) continue;
    items.push({
      id: `svc-${s.id}`,
      kind: "service_end",
      dueAt: due,
      daysFromToday: daysFromToday(due),
      title: `${s.name} ends`,
      detail: s.vendorName,
      clientId: s.clientId,
      clientName: s.clientName,
      link: s.clientId ? `/clients/${s.clientId}` : null,
    });
  }

  // 6. Backup restore tests — derive next-due from cadence + last-test.
  const backupRows = await db
    .select({
      id: clientBackupStrategy.id,
      lastRestoreTestAt: clientBackupStrategy.lastRestoreTestAt,
      cadence: clientBackupStrategy.restoreTestCadence,
      clientId: clientBackupStrategy.clientId,
      clientName: clients.name,
    })
    .from(clientBackupStrategy)
    .leftJoin(clients, eq(clientBackupStrategy.clientId, clients.id))
    .where(eq(clientBackupStrategy.organizationId, organizationId));
  for (const b of backupRows) {
    if (!b.cadence || !CADENCE_DAYS[b.cadence]) continue;
    const cd = CADENCE_DAYS[b.cadence];
    if (cd === 0) continue;
    const last = b.lastRestoreTestAt ? new Date(b.lastRestoreTestAt) : new Date();
    const next = new Date(last.getTime() + cd * 86_400_000);
    const due = next.toISOString().slice(0, 10);
    items.push({
      id: `rest-${b.id}`,
      kind: "restore_test",
      dueAt: due,
      daysFromToday: daysFromToday(due),
      title: `Restore test (${b.cadence.replace("_", "-")})`,
      detail: b.lastRestoreTestAt
        ? `Last tested ${ymd(b.lastRestoreTestAt)}`
        : "Never tested",
      clientId: b.clientId,
      clientName: b.clientName,
      link: b.clientId ? `/clients/${b.clientId}` : null,
    });
  }

  // 7. User-defined recurring tasks.
  const taskRows = await db
    .select({
      id: clientRecurringTasks.id,
      title: clientRecurringTasks.title,
      kind: clientRecurringTasks.kind,
      nextDueAt: clientRecurringTasks.nextDueAt,
      cadenceDays: clientRecurringTasks.cadenceDays,
      clientId: clientRecurringTasks.clientId,
      clientName: clients.name,
      notes: clientRecurringTasks.notes,
    })
    .from(clientRecurringTasks)
    .leftJoin(clients, eq(clientRecurringTasks.clientId, clients.id))
    .where(
      and(
        eq(clientRecurringTasks.organizationId, organizationId),
        isNull(clientRecurringTasks.archivedAt),
      ),
    );
  for (const t of taskRows) {
    const due = ymd(t.nextDueAt);
    if (!due) continue;
    items.push({
      id: `task-${t.id}`,
      kind: "recurring_task",
      dueAt: due,
      daysFromToday: daysFromToday(due),
      title: t.title,
      detail: `${t.kind} · every ${t.cadenceDays} days${t.notes ? " · " + t.notes : ""}`,
      clientId: t.clientId,
      clientName: t.clientName,
      link: t.clientId ? `/clients/${t.clientId}` : null,
    });
  }

  /* ---- Credential audits (voice services + circuits, 30-day cycle) -- */
  // due = last_audited_at + 30 days. Null last_audited_at = due today
  // (never audited).
  const todayIso = new Date().toISOString().slice(0, 10);
  const addAuditItem = (
    id: string,
    title: string,
    detail: string | null,
    clientId: string | null,
    clientName: string | null,
    link: string,
    lastAuditedAt: Date | null,
  ) => {
    let dueIso: string;
    if (lastAuditedAt == null) {
      dueIso = todayIso;
    } else {
      const due = new Date(lastAuditedAt);
      due.setUTCDate(due.getUTCDate() + CREDENTIAL_AUDIT_INTERVAL_DAYS);
      dueIso = due.toISOString().slice(0, 10);
    }
    items.push({
      id,
      kind: "credential_audit",
      dueAt: dueIso,
      daysFromToday: daysFromToday(dueIso),
      title,
      detail,
      clientId,
      clientName,
      link,
    });
  };

  const voiceRows = await db
    .select({
      id: voiceServices.id,
      clientId: voiceServices.clientId,
      clientName: clients.name,
      provider: voiceServices.provider,
      providerTier: voiceServices.providerTier,
      lastAuditedAt: voiceServices.lastAuditedAt,
    })
    .from(voiceServices)
    .innerJoin(clients, eq(clients.id, voiceServices.clientId))
    .where(eq(voiceServices.organizationId, organizationId));
  for (const v of voiceRows) {
    addAuditItem(
      `voice-audit-${v.id}`,
      `Audit ${v.provider} (voice) at ${v.clientName}`,
      v.providerTier ? `Tier: ${v.providerTier}` : null,
      v.clientId,
      v.clientName,
      `/clients/${v.clientId}/voice`,
      v.lastAuditedAt,
    );
  }

  const circuitAuditRows = await db
    .select({
      id: clientNetworkCircuits.id,
      clientId: clientNetworkCircuits.clientId,
      clientName: clients.name,
      carrier: clientNetworkCircuits.carrier,
      productLabel: clientNetworkCircuits.productLabel,
      lastAuditedAt: clientNetworkCircuits.lastAuditedAt,
    })
    .from(clientNetworkCircuits)
    .innerJoin(clients, eq(clients.id, clientNetworkCircuits.clientId))
    .where(eq(clientNetworkCircuits.organizationId, organizationId));
  for (const cir of circuitAuditRows) {
    addAuditItem(
      `circuit-audit-${cir.id}`,
      `Audit ${cir.carrier} (ISP) at ${cir.clientName}`,
      cir.productLabel,
      cir.clientId,
      cir.clientName,
      `/clients/${cir.clientId}/internet`,
      cir.lastAuditedAt,
    );
  }

  // Sort by due date ascending (overdue first).
  items.sort((a, b) => a.daysFromToday - b.daysFromToday);

  // Filter to the window (always include overdue).
  return items.filter((i) => i.daysFromToday <= windowDays);
}

export type UpcomingBucket = {
  label: string;
  range: string;
  items: UpcomingItem[];
};

export function bucketUpcoming(items: UpcomingItem[]): UpcomingBucket[] {
  const buckets: UpcomingBucket[] = [
    { label: "Overdue", range: "< today", items: [] },
    { label: "Next 30 days", range: "1–30", items: [] },
    { label: "31–60 days", range: "31–60", items: [] },
    { label: "61–90 days", range: "61–90", items: [] },
    { label: "Beyond 90 days", range: "90+", items: [] },
  ];
  for (const i of items) {
    if (i.daysFromToday < 0) buckets[0].items.push(i);
    else if (i.daysFromToday <= 30) buckets[1].items.push(i);
    else if (i.daysFromToday <= 60) buckets[2].items.push(i);
    else if (i.daysFromToday <= 90) buckets[3].items.push(i);
    else buckets[4].items.push(i);
  }
  return buckets;
}

export const KIND_LABEL: Record<UpcomingItemKind, string> = {
  license_renewal: "License renewal",
  contract_end: "Contract end",
  app_secret: "App secret expiry",
  app_cert: "App cert expiry",
  circuit_term: "Circuit term",
  service_end: "Service end",
  restore_test: "Restore test",
  recurring_task: "Recurring task",
  credential_audit: "Credential audit",
};

// Suppress unused-import warning for `sql` (kept available for future
// query helpers).
export const __sql = sql;
export const __asc = asc;