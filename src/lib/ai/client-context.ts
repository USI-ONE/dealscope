/**
 * Build a complete TEXT context blob for one specific client — every
 * piece of structured + unstructured data TechOS holds about them.
 *
 * Used by the per-client AI assistant to answer free-form questions
 * grounded ONLY in that client's data. Critical property: every query
 * is filtered by `client_id = X` so no row from any other client can
 * ever land in the resulting context.
 *
 * The output is a Markdown-flavoured plain text document organized by
 * section, designed to be the AI's sole source of truth. We deliberately
 * avoid passing other clients' data (vendor names + locations etc.
 * shared across the org are fine — those don't identify other USI
 * customers).
 */
import "server-only";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clientAppRegistrations,
  clientBackupStrategy,
  clientBackupSystems,
  clientContacts,
  clientEvents,
  clientIdentities,
  clientLocations,
  clientNetworkCircuits,
  clientNetworkSegments,
  clientObservations,
  clientPages,
  clientProcedures,
  clients,
  domains,
  hardware,
  licenseAssignments,
  licenses,
  memberships,
  services,
  users,
  vendors,
  type ProcedureStep,
} from "@/db/schema";

export type ClientAiContext = {
  clientName: string;
  clientId: string;
  contextText: string;
  /** Rough character count of contextText — useful for cost monitoring. */
  contextChars: number;
};

const fmtCents = (cents: number | null | undefined) =>
  cents == null
    ? "—"
    : `$${(cents / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toISOString().slice(0, 10);
};

const fmtDateTime = (d: Date | string | null | undefined) => {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toISOString().replace("T", " ").slice(0, 16);
};

/** Truncate a runbook page body so any single page doesn't dominate
 *  the context window. We keep the first ~3000 chars per page, which
 *  is enough for headings + first few sections. */
const truncatePage = (s: string, max = 3000) =>
  s.length > max
    ? s.slice(0, max) + `\n\n_[...truncated, ${s.length - max} more chars]_`
    : s;

export async function loadClientAiContext(
  organizationId: string,
  clientId: string,
): Promise<ClientAiContext> {
  // Verify the client belongs to this org. Single source of identity
  // for the whole context — if this lookup fails, we never reach any
  // of the downstream queries.
  const client = await db.query.clients.findFirst({
    where: and(
      eq(clients.id, clientId),
      eq(clients.organizationId, organizationId),
    ),
  });
  if (!client) {
    throw new Error("Client not found for this organization");
  }

  // Optional manager name from membership join.
  const managerRow = client.accountManagerMembershipId
    ? await db
        .select({ name: users.name, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(eq(memberships.id, client.accountManagerMembershipId))
        .limit(1)
    : null;
  const managerLabel = managerRow?.[0]?.name ?? managerRow?.[0]?.email ?? null;

  // Load every relevant per-client table in parallel. EVERY query
  // includes `client_id = X` as a hard filter.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
  const [
    locationRows,
    contactRows,
    identityRow,
    circuitRows,
    segmentRows,
    backupStrategyRow,
    backupSystemRows,
    hardwareRows,
    licenseRows,
    serviceRows,
    domainRows,
    procedureRows,
    obsRows,
    eventRows,
    pageRows,
    licenseAssignmentRows,
    appRegRows,
  ] = await Promise.all([
    db
      .select()
      .from(clientLocations)
      .where(eq(clientLocations.clientId, clientId))
      .orderBy(desc(clientLocations.isPrimary), asc(clientLocations.label)),
    db
      .select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, clientId))
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.fullName)),
    db
      .select()
      .from(clientIdentities)
      .where(eq(clientIdentities.clientId, clientId))
      .limit(1),
    db
      .select({
        circuit: clientNetworkCircuits,
        locationLabel: clientLocations.label,
        vendorName: vendors.name,
      })
      .from(clientNetworkCircuits)
      .leftJoin(
        clientLocations,
        eq(clientNetworkCircuits.locationId, clientLocations.id),
      )
      .leftJoin(vendors, eq(clientNetworkCircuits.vendorId, vendors.id))
      .where(eq(clientNetworkCircuits.clientId, clientId))
      .orderBy(asc(clientNetworkCircuits.role)),
    db
      .select({
        segment: clientNetworkSegments,
        locationLabel: clientLocations.label,
      })
      .from(clientNetworkSegments)
      .leftJoin(
        clientLocations,
        eq(clientNetworkSegments.locationId, clientLocations.id),
      )
      .where(eq(clientNetworkSegments.clientId, clientId))
      .orderBy(asc(clientNetworkSegments.vlanId), asc(clientNetworkSegments.name)),
    db
      .select()
      .from(clientBackupStrategy)
      .where(eq(clientBackupStrategy.clientId, clientId))
      .limit(1),
    db
      .select({ system: clientBackupSystems, vendorName: vendors.name })
      .from(clientBackupSystems)
      .leftJoin(vendors, eq(clientBackupSystems.vendorId, vendors.id))
      .where(eq(clientBackupSystems.clientId, clientId))
      .orderBy(asc(clientBackupSystems.name)),
    db
      .select({ hw: hardware, locationLabel: clientLocations.label })
      .from(hardware)
      .leftJoin(clientLocations, eq(hardware.locationId, clientLocations.id))
      .where(
        and(
          eq(hardware.clientId, clientId),
          eq(hardware.status, "active"),
        ),
      )
      .orderBy(asc(hardware.kind), asc(hardware.label)),
    db
      .select({ license: licenses, vendorName: vendors.name })
      .from(licenses)
      .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
      .where(
        and(
          eq(licenses.clientId, clientId),
          eq(licenses.status, "active"),
        ),
      )
      .orderBy(asc(licenses.productName)),
    db
      .select({ service: services, vendorName: vendors.name })
      .from(services)
      .leftJoin(vendors, eq(services.vendorId, vendors.id))
      .where(
        and(
          eq(services.clientId, clientId),
          eq(services.status, "active"),
        ),
      )
      .orderBy(asc(services.name)),
    db
      .select({ domain: domains, vendorName: vendors.name })
      .from(domains)
      .leftJoin(vendors, eq(domains.vendorId, vendors.id))
      .where(eq(domains.clientId, clientId))
      .orderBy(asc(domains.name)),
    db
      .select()
      .from(clientProcedures)
      .where(
        and(
          eq(clientProcedures.clientId, clientId),
          isNull(clientProcedures.archivedAt),
        ),
      )
      .orderBy(asc(clientProcedures.kind), asc(clientProcedures.title)),
    db
      .select()
      .from(clientObservations)
      .where(
        and(
          eq(clientObservations.clientId, clientId),
          sql`${clientObservations.status} NOT IN ('resolved','wont_fix')`,
        ),
      )
      .orderBy(asc(clientObservations.severity), asc(clientObservations.dueDate)),
    db
      .select()
      .from(clientEvents)
      .where(
        and(
          eq(clientEvents.clientId, clientId),
          gte(clientEvents.occurredAt, ninetyDaysAgo),
        ),
      )
      .orderBy(desc(clientEvents.occurredAt))
      .limit(50),
    db
      .select({
        page: clientPages,
        locationLabel: clientLocations.label,
      })
      .from(clientPages)
      .leftJoin(clientLocations, eq(clientPages.locationId, clientLocations.id))
      .where(
        and(
          eq(clientPages.clientId, clientId),
          isNull(clientPages.archivedAt),
        ),
      )
      .orderBy(asc(clientPages.sortOrder), asc(clientPages.title)),
    db
      .select({ assignment: licenseAssignments, productName: licenses.productName, hwLabel: hardware.label })
      .from(licenseAssignments)
      .innerJoin(licenses, eq(licenseAssignments.licenseId, licenses.id))
      .leftJoin(hardware, eq(licenseAssignments.hardwareId, hardware.id))
      .where(eq(licenseAssignments.clientId, clientId)),
    db
      .select()
      .from(clientAppRegistrations)
      .where(eq(clientAppRegistrations.clientId, clientId))
      .orderBy(asc(clientAppRegistrations.displayName)),
  ]);

  const identity = identityRow[0] ?? null;
  const backupStrategy = backupStrategyRow[0] ?? null;

  /* -------------------------------------------------------------------
   * Compose the context document.
   * ------------------------------------------------------------------- */
  const lines: string[] = [];
  lines.push(`# Client: ${client.name}`);
  lines.push("");
  lines.push("## Client metadata");
  lines.push(`- Name: ${client.name}`);
  lines.push(`- Slug: ${client.slug}`);
  lines.push(`- Status: ${client.status}`);
  lines.push(`- Primary domain: ${client.primaryDomain ?? "—"}`);
  lines.push(`- Industry: ${client.industry ?? "—"}`);
  lines.push(`- Location (free-text): ${client.location ?? "—"}`);
  lines.push(`- Account manager: ${managerLabel ?? "—"}`);
  lines.push(
    `- Monthly recurring: ${fmtCents(client.monthlyRecurringCents)}`,
  );
  lines.push(`- AutoElevate (client-level): ${client.autoelevateStatus ?? "—"}`);
  lines.push(`- Latest CSAT: ${client.latestCsat ?? "—"}${client.latestCsatComment ? ` ("${client.latestCsatComment}")` : ""}`);
  lines.push(`- Syncro customer id: ${client.syncroCustomerId ?? "—"}`);
  lines.push(`- QB customer name: ${client.qbCustomerName ?? "—"}`);
  if (client.notes) {
    lines.push("");
    lines.push("### Client notes");
    lines.push(client.notes);
  }

  /* ---- Locations ---- */
  lines.push("");
  lines.push(`## Locations (${locationRows.length})`);
  if (locationRows.length === 0) {
    lines.push("(none recorded)");
  } else {
    for (const l of locationRows) {
      const addr = [
        l.addressLine1,
        l.addressLine2,
        [l.city, l.region].filter(Boolean).join(", "),
        l.postalCode,
        l.country,
      ]
        .filter(Boolean)
        .join("; ");
      lines.push(`- **${l.label}**${l.isPrimary ? " (primary)" : ""}`);
      if (addr) lines.push(`  - Address: ${addr}`);
      if (l.subnet) lines.push(`  - Subnet: ${l.subnet}`);
      if (l.isp) lines.push(`  - ISP: ${l.isp}`);
      if (l.ispCircuitId) lines.push(`  - ISP circuit id: ${l.ispCircuitId}`);
      if (l.securityPosture) lines.push(`  - Security posture: ${l.securityPosture}`);
      if (l.networkNotes) lines.push(`  - Network notes: ${l.networkNotes}`);
      if (l.notes) lines.push(`  - Notes: ${l.notes}`);
    }
  }

  /* ---- Contacts ---- */
  lines.push("");
  lines.push(`## Contacts (${contactRows.length})`);
  for (const c of contactRows) {
    lines.push(
      `- ${c.fullName}${c.isPrimary ? " (primary)" : ""}` +
        (c.title ? ` — ${c.title}` : "") +
        (c.email ? ` <${c.email}>` : "") +
        (c.phone ? ` ${c.phone}` : ""),
    );
    if (c.notes) lines.push(`  - Notes: ${c.notes}`);
  }
  if (contactRows.length === 0) lines.push("(none recorded)");

  /* ---- Identity ---- */
  lines.push("");
  lines.push("## Identity");
  if (!identity) {
    lines.push("(none recorded)");
  } else {
    lines.push(`- Provider: ${identity.identityProvider ?? "—"}`);
    lines.push(`- Primary domain: ${identity.primaryDomain ?? "—"}`);
    lines.push(`- Tenant default domain: ${identity.tenantDefaultDomain ?? "—"}`);
    lines.push(`- Tenant id: ${identity.tenantId ?? "—"}`);
    lines.push(`- Domain registrar: ${identity.domainRegistrar ?? "—"}`);
    lines.push(`- Directory sync: ${identity.directorySync ?? "—"}`);
    lines.push(`- MFA posture: ${identity.mfaPosture ?? "—"}`);
    if (identity.conditionalAccessNotes)
      lines.push(`- Conditional access notes: ${identity.conditionalAccessNotes}`);
    if (identity.ssoConsumers)
      lines.push(`- SSO consumers: ${JSON.stringify(identity.ssoConsumers)}`);
    if (identity.notes) lines.push(`- Notes: ${identity.notes}`);
  }

  /* ---- App registrations ---- */
  if (appRegRows.length > 0) {
    lines.push("");
    lines.push(`## App registrations (${appRegRows.length})`);
    for (const a of appRegRows) {
      lines.push(
        `- ${a.displayName} (id ${a.applicationId})` +
          ` — status: ${a.status}` +
          (a.secretExpiresAt ? ` — secret expires ${fmtDate(a.secretExpiresAt)}` : "") +
          (a.certExpiresAt ? ` — cert expires ${fmtDate(a.certExpiresAt)}` : ""),
      );
      if (a.purpose) lines.push(`  - Purpose: ${a.purpose}`);
    }
  }

  /* ---- Network — circuits + segments ---- */
  lines.push("");
  lines.push(`## Internet circuits (${circuitRows.length})`);
  if (circuitRows.length === 0) {
    lines.push("(none recorded)");
  } else {
    for (const r of circuitRows) {
      const c = r.circuit;
      lines.push(
        `- ${c.role}${r.locationLabel ? ` at ${r.locationLabel}` : ""}: ` +
          `${r.vendorName ?? c.carrier ?? "(carrier unknown)"}` +
          (c.productLabel ? ` — ${c.productLabel}` : "") +
          (c.speedDownMbps ? ` — ${c.speedDownMbps}/${c.speedUpMbps ?? "?"} Mbps` : "") +
          (c.staticIpRange ? ` — IPs ${c.staticIpRange}` : "") +
          (c.accountNumber ? ` — account ${c.accountNumber}` : "") +
          (c.supportPhone ? ` — support ${c.supportPhone}` : ""),
      );
      if (c.notes) lines.push(`  - Notes: ${c.notes}`);
    }
  }
  lines.push("");
  lines.push(`## VLANs / segments (${segmentRows.length})`);
  for (const s of segmentRows) {
    lines.push(
      `- ${s.segment.name}` +
        (s.segment.vlanId != null ? ` (VLAN ${s.segment.vlanId})` : "") +
        (s.segment.subnet ? ` — subnet ${s.segment.subnet}` : "") +
        (s.locationLabel ? ` at ${s.locationLabel}` : "") +
        (s.segment.purpose ? ` — ${s.segment.purpose}` : "") +
        (s.segment.isolatedFromCorp ? " (isolated from corp)" : ""),
    );
  }
  if (segmentRows.length === 0) lines.push("(none recorded)");

  /* ---- Backup ---- */
  lines.push("");
  lines.push("## Backup strategy");
  if (!backupStrategy) {
    lines.push("(none recorded)");
  } else {
    lines.push(
      `- RPO: ${backupStrategy.rpoMinutes != null ? backupStrategy.rpoMinutes + " min" : "—"}, ` +
        `RTO: ${backupStrategy.rtoMinutes != null ? backupStrategy.rtoMinutes + " min" : "—"}`,
    );
    lines.push(
      `- Offsite copy: ${backupStrategy.offsiteCopy ? "yes" : "no"}` +
        (backupStrategy.offsiteLocation
          ? ` (${backupStrategy.offsiteLocation})`
          : ""),
    );
    lines.push(`- Immutable copy: ${backupStrategy.immutableCopy ? "yes" : "no"}`);
    lines.push(
      `- Encryption at rest: ${backupStrategy.encryptionAtRest ? "yes" : "no"}`,
    );
    if (backupStrategy.lastRestoreTestAt)
      lines.push(`- Last restore test: ${fmtDate(backupStrategy.lastRestoreTestAt)}`);
    if (backupStrategy.notes) lines.push(`- Notes: ${backupStrategy.notes}`);
  }
  if (backupSystemRows.length > 0) {
    lines.push(`\n### Backup systems (${backupSystemRows.length})`);
    for (const r of backupSystemRows) {
      lines.push(
        `- ${r.system.name} (${r.vendorName ?? "?"})` +
          (r.system.scopeKinds && r.system.scopeKinds.length > 0
            ? ` — covers ${r.system.scopeKinds.join(", ")}`
            : "") +
          (r.system.frequency ? ` — ${r.system.frequency}` : "") +
          (r.system.retention ? ` — retention ${r.system.retention}` : "") +
          (r.system.destinationKind ? ` — ${r.system.destinationKind}` : "") +
          (r.system.destinationLocation ? ` (${r.system.destinationLocation})` : ""),
      );
    }
  }

  /* ---- Hardware ---- */
  lines.push("");
  lines.push(`## Hardware — active (${hardwareRows.length})`);
  if (hardwareRows.length === 0) {
    lines.push("(none)");
  } else {
    // Group by kind so the AI can answer "how many servers / laptops".
    const byKind = new Map<string, typeof hardwareRows>();
    for (const r of hardwareRows) {
      const arr = byKind.get(r.hw.kind) ?? [];
      arr.push(r);
      byKind.set(r.hw.kind, arr);
    }
    for (const [kind, list] of byKind) {
      lines.push(`\n### ${kind} (${list.length})`);
      for (const r of list) {
        const h = r.hw;
        lines.push(
          `- ${h.label}` +
            (h.manufacturer || h.model
              ? ` (${[h.manufacturer, h.model].filter(Boolean).join(" ")})`
              : "") +
            (h.osName ? ` — ${h.osName}${h.osVersion ? " " + h.osVersion : ""}` : "") +
            (h.serialNumber ? ` — SN ${h.serialNumber}` : "") +
            (h.assetTag ? ` — tag ${h.assetTag}` : "") +
            (r.locationLabel ? ` @ ${r.locationLabel}` : "") +
            (h.assignedToLabel ? ` — assigned to ${h.assignedToLabel}` : "") +
            (h.lastIp ? ` — IP ${h.lastIp}` : "") +
            (h.lastSeenAt ? ` — last seen ${fmtDate(h.lastSeenAt)}` : "") +
            (h.isEol ? " — **EOL**" : "") +
            (h.windows11Readiness
              ? ` — Win11: ${h.windows11Readiness.slice(0, 60)}`
              : "") +
            (h.intuneEnrolled ? ` — Intune: ${h.intuneEnrolled}` : "") +
            (h.entraJoined ? ` — Entra: ${h.entraJoined}` : "") +
            (h.autoelevateStatus ? ` — AutoElevate: ${h.autoelevateStatus}` : "") +
            (h.threatlockerRunning
              ? ` — Threatlocker: ${h.threatlockerRunning}`
              : "") +
            (h.notOnContract === "1" ? " — _not on contract_" : "") +
            (h.notes ? ` — notes: ${h.notes}` : ""),
        );
      }
    }
  }

  /* ---- Licenses ---- */
  lines.push("");
  lines.push(`## Licenses — active (${licenseRows.length})`);
  for (const r of licenseRows) {
    const l = r.license;
    lines.push(
      `- ${l.productName}` +
        (l.sku ? ` (${l.sku})` : "") +
        ` — vendor: ${r.vendorName ?? "?"}` +
        ` — category: ${l.category}` +
        ` — seats: ${l.seatsTotal ?? "—"}` +
        ` — billing: ${l.billingPeriod}` +
        ` — renewal: ${l.renewalDate ?? "—"}` +
        ` — rebill: ${fmtCents(l.rebillRateCents)}` +
        (l.notes ? ` — ${l.notes}` : ""),
    );
  }
  if (licenseRows.length === 0) lines.push("(none)");

  /* ---- License assignments ---- */
  if (licenseAssignmentRows.length > 0) {
    lines.push("");
    lines.push(`## License assignments (${licenseAssignmentRows.length})`);
    for (const r of licenseAssignmentRows) {
      lines.push(
        `- ${r.productName} → ` +
          (r.hwLabel ? `device ${r.hwLabel}` : "") +
          (r.assignment.assigneeLabel ? ` (${r.assignment.assigneeLabel})` : "") +
          (r.assignment.assigneeEmail ? ` <${r.assignment.assigneeEmail}>` : "") +
          ` — source ${r.assignment.source}`,
      );
    }
  }

  /* ---- Services ---- */
  lines.push("");
  lines.push(`## Services — active (${serviceRows.length})`);
  for (const r of serviceRows) {
    const s = r.service;
    lines.push(
      `- ${s.name}` +
        ` — vendor: ${r.vendorName ?? "?"}` +
        ` — category: ${s.category}` +
        ` — paid by: ${s.paidBy}` +
        (s.accountNumber ? ` — account ${s.accountNumber}` : "") +
        (s.supportPhone ? ` — support ${s.supportPhone}` : "") +
        (s.supportPortalUrl ? ` — portal ${s.supportPortalUrl}` : "") +
        (s.renewalDate ? ` — renewal ${s.renewalDate}` : "") +
        ` — monthly rebill: ${fmtCents(s.monthlyRebillRateCents)}` +
        (s.notes ? ` — ${s.notes}` : ""),
    );
  }
  if (serviceRows.length === 0) lines.push("(none)");

  /* ---- Domains ---- */
  lines.push("");
  lines.push(`## Domains (${domainRows.length})`);
  for (const r of domainRows) {
    const d = r.domain;
    lines.push(
      `- ${d.name}` +
        (d.registrar ? ` (registrar: ${d.registrar})` : "") +
        (r.vendorName ? ` — vendor: ${r.vendorName}` : "") +
        (d.expiresAt ? ` — expires ${d.expiresAt}` : "") +
        (d.autoRenew ? " — auto-renews" : "") +
        (d.billable ? ` — billable @ ${fmtCents(d.rebillRateCents)}` : ""),
    );
  }
  if (domainRows.length === 0) lines.push("(none)");

  /* ---- Procedures ---- */
  if (procedureRows.length > 0) {
    lines.push("");
    lines.push(`## Procedures / runbooks (${procedureRows.length})`);
    for (const p of procedureRows) {
      const steps = (p.steps ?? []) as ProcedureStep[];
      lines.push(`- **${p.title}** (${p.kind}, ${steps.length} steps)` +
        (p.lastRunAt ? ` — last run ${fmtDate(p.lastRunAt)}` : ""));
      if (p.description) lines.push(`  - ${p.description.slice(0, 300)}`);
    }
  }

  /* ---- Open observations ---- */
  if (obsRows.length > 0) {
    lines.push("");
    lines.push(`## Open observations (${obsRows.length})`);
    for (const o of obsRows) {
      lines.push(
        `- [${o.severity}/${o.status}] ${o.title}` +
          (o.dueDate ? ` — due ${o.dueDate}` : "") +
          (o.description ? ` — ${o.description.slice(0, 200)}` : ""),
      );
    }
  }

  /* ---- Recent events ---- */
  if (eventRows.length > 0) {
    lines.push("");
    lines.push(`## Recent events — last 90 days (${eventRows.length})`);
    for (const e of eventRows) {
      lines.push(
        `- ${fmtDateTime(e.occurredAt)} [${e.kind}/${e.severity}] ${e.title}` +
          (e.narrative ? ` — ${e.narrative.slice(0, 200)}` : ""),
      );
    }
  }

  /* ---- Runbook pages (rich markdown bodies) ---- */
  if (pageRows.length > 0) {
    lines.push("");
    lines.push(`## Runbook pages (${pageRows.length})`);
    lines.push(
      "_These are long-form markdown notes imported from the legacy Joplin export plus any pages created in TechOS. The most authoritative free-form content about this client lives here._",
    );
    for (const r of pageRows) {
      lines.push("");
      lines.push(
        `### Page: ${r.page.title} (${r.page.kind}${r.locationLabel ? `, ${r.locationLabel}` : ""})`,
      );
      lines.push(truncatePage(r.page.bodyMd));
    }
  }

  const contextText = lines.join("\n");
  return {
    clientName: client.name,
    clientId,
    contextText,
    contextChars: contextText.length,
  };
}
