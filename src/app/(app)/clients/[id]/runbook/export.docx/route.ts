/**
 * GET /clients/[id]/runbook/export.docx
 *
 * Generates a comprehensive per-client runbook DOCX covering contacts,
 * locations, identity, network, backups, hardware, licenses, services,
 * domains, procedures + step lists, recurring tasks, recent events, and
 * open observations. Same data the client page renders — packaged as a
 * single portable document a tech can take on-site or email out.
 */
import { and, asc, desc, eq, gte } from "drizzle-orm";
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
  clientProcedures,
  clientRecurringTasks,
  clients,
  domains,
  hardware,
  licenses,
  memberships,
  services,
  users,
  vendors,
  type ProcedureStep,
} from "@/db/schema";
import { requireContext } from "@/lib/auth-helpers";
import { buildClientRunbookDocx } from "@/lib/runbook/runbook-docx-builder";

export const runtime = "nodejs";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function GET(
  _req: Request,
  ctxArg: { params: Promise<{ id: string }> },
) {
  const { id } = await ctxArg.params;
  const ctx = await requireContext();

  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, id), eq(clients.organizationId, ctx.organization.id)),
  });
  if (!client) return new Response("Client not found", { status: 404 });

  // Pull every related table in parallel. Joining vendor + user names so
  // the builder doesn't have to do another round trip.
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
  const [
    contactRows,
    locationRows,
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
    taskRows,
    eventRows,
    obsRows,
    accountManagerRow,
  ] = await Promise.all([
    db
      .select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, client.id))
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.fullName)),
    db
      .select()
      .from(clientLocations)
      .where(eq(clientLocations.clientId, client.id))
      .orderBy(desc(clientLocations.isPrimary), asc(clientLocations.label)),
    db
      .select()
      .from(clientIdentities)
      .where(eq(clientIdentities.clientId, client.id))
      .limit(1),
    db
      .select({
        circuit: clientNetworkCircuits,
        locationLabel: clientLocations.label,
      })
      .from(clientNetworkCircuits)
      .leftJoin(
        clientLocations,
        eq(clientNetworkCircuits.locationId, clientLocations.id),
      )
      .where(eq(clientNetworkCircuits.clientId, client.id))
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
      .where(eq(clientNetworkSegments.clientId, client.id))
      .orderBy(asc(clientNetworkSegments.vlanId), asc(clientNetworkSegments.name)),
    db
      .select()
      .from(clientBackupStrategy)
      .where(eq(clientBackupStrategy.clientId, client.id))
      .limit(1),
    db
      .select({ system: clientBackupSystems, vendorName: vendors.name })
      .from(clientBackupSystems)
      .leftJoin(vendors, eq(clientBackupSystems.vendorId, vendors.id))
      .where(eq(clientBackupSystems.clientId, client.id))
      .orderBy(asc(clientBackupSystems.name)),
    db
      .select({ hardware, locationLabel: clientLocations.label })
      .from(hardware)
      .leftJoin(clientLocations, eq(hardware.locationId, clientLocations.id))
      .where(eq(hardware.clientId, client.id))
      .orderBy(asc(hardware.kind), asc(hardware.label)),
    db
      .select({ license: licenses, vendorName: vendors.name })
      .from(licenses)
      .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
      .where(
        and(
          eq(licenses.clientId, client.id),
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
          eq(services.clientId, client.id),
          eq(services.status, "active"),
        ),
      )
      .orderBy(asc(services.name)),
    db
      .select()
      .from(domains)
      .where(eq(domains.clientId, client.id))
      .orderBy(asc(domains.name)),
    db
      .select({
        procedure: clientProcedures,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(clientProcedures)
      .leftJoin(
        memberships,
        eq(clientProcedures.ownerMembershipId, memberships.id),
      )
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(eq(clientProcedures.clientId, client.id))
      .orderBy(asc(clientProcedures.kind), asc(clientProcedures.title)),
    db
      .select({
        task: clientRecurringTasks,
        ownerName: users.name,
        ownerEmail: users.email,
        procedureTitle: clientProcedures.title,
      })
      .from(clientRecurringTasks)
      .leftJoin(
        memberships,
        eq(clientRecurringTasks.ownerMembershipId, memberships.id),
      )
      .leftJoin(users, eq(memberships.userId, users.id))
      .leftJoin(
        clientProcedures,
        eq(clientRecurringTasks.procedureId, clientProcedures.id),
      )
      .where(eq(clientRecurringTasks.clientId, client.id))
      .orderBy(asc(clientRecurringTasks.nextDueAt)),
    db
      .select({
        event: clientEvents,
        recordedByName: users.name,
        recordedByEmail: users.email,
      })
      .from(clientEvents)
      .leftJoin(
        memberships,
        eq(clientEvents.recordedByMembershipId, memberships.id),
      )
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(clientEvents.clientId, client.id),
          gte(clientEvents.occurredAt, ninetyDaysAgo),
        ),
      )
      .orderBy(desc(clientEvents.occurredAt)),
    db
      .select()
      .from(clientObservations)
      .where(eq(clientObservations.clientId, client.id))
      .orderBy(asc(clientObservations.dueDate)),
    // Look up account manager name in a side query so we don't need
    // another join in the clients select above.
    client.accountManagerMembershipId
      ? db
          .select({ name: users.name, email: users.email })
          .from(memberships)
          .innerJoin(users, eq(memberships.userId, users.id))
          .where(eq(memberships.id, client.accountManagerMembershipId))
          .limit(1)
      : Promise.resolve([] as { name: string | null; email: string }[]),
  ]);

  const identity = identityRow[0] ?? null;
  const backupStrategy = backupStrategyRow[0] ?? null;
  void clientAppRegistrations; // schema import kept available for future enrich

  const buf = await buildClientRunbookDocx({
    client: {
      name: client.name,
      slug: client.slug,
      status: client.status,
      primaryDomain: client.primaryDomain,
      industry: client.industry,
      location: client.location,
      autoelevateStatus: client.autoelevateStatus,
      accountManagerName:
        accountManagerRow[0]?.name ?? accountManagerRow[0]?.email ?? null,
      monthlyRecurringCents: client.monthlyRecurringCents,
      notes: client.notes,
    },
    generatedAt: new Date(),
    generatedByName: ctx.user.name ?? ctx.user.email,
    contacts: contactRows.map((c) => ({
      fullName: c.fullName,
      title: c.title,
      email: c.email,
      phone: c.phone,
      isPrimary: c.isPrimary,
      notes: c.notes,
    })),
    locations: locationRows.map((l) => ({
      label: l.label,
      addressLine1: l.addressLine1,
      addressLine2: l.addressLine2,
      city: l.city,
      region: l.region,
      postalCode: l.postalCode,
      country: l.country,
      isPrimary: l.isPrimary,
      subnet: l.subnet,
      isp: l.isp,
      securityPosture: l.securityPosture,
      notes: l.notes,
    })),
    identity: identity
      ? {
          identityProvider: identity.identityProvider,
          primaryDomain: identity.primaryDomain,
          tenantDefaultDomain: identity.tenantDefaultDomain,
          tenantId: identity.tenantId,
          domainRegistrar: identity.domainRegistrar,
          directorySync: identity.directorySync,
          mfaPosture: identity.mfaPosture,
          conditionalAccessNotes: identity.conditionalAccessNotes,
          notes: identity.notes,
        }
      : null,
    circuits: circuitRows.map((r) => ({
      role: r.circuit.role,
      carrier: r.circuit.carrier,
      productLabel: r.circuit.productLabel,
      speedDownMbps: r.circuit.speedDownMbps,
      speedUpMbps: r.circuit.speedUpMbps,
      staticIpRange: r.circuit.staticIpRange,
      accountNumber: r.circuit.accountNumber,
      supportPhone: r.circuit.supportPhone,
      locationLabel: r.locationLabel,
      notes: r.circuit.notes,
    })),
    segments: segmentRows.map((r) => ({
      name: r.segment.name,
      vlanId: r.segment.vlanId,
      subnet: r.segment.subnet,
      purpose: r.segment.purpose,
      isolatedFromCorp: r.segment.isolatedFromCorp,
      locationLabel: r.locationLabel,
    })),
    backupStrategy: backupStrategy
      ? {
          rpoMinutes: backupStrategy.rpoMinutes,
          rtoMinutes: backupStrategy.rtoMinutes,
          offsiteCopy: backupStrategy.offsiteCopy,
          offsiteLocation: backupStrategy.offsiteLocation,
          immutableCopy: backupStrategy.immutableCopy,
          encryptionAtRest: backupStrategy.encryptionAtRest,
          drRunbookUrl: backupStrategy.drRunbookUrl,
          lastRestoreTestAt: backupStrategy.lastRestoreTestAt,
          restoreTestCadence: backupStrategy.restoreTestCadence,
          notes: backupStrategy.notes,
        }
      : null,
    backupSystems: backupSystemRows.map((r) => ({
      name: r.system.name,
      vendorName: r.vendorName,
      scopeKinds: r.system.scopeKinds,
      frequency: r.system.frequency,
      retention: r.system.retention,
      destinationKind: r.system.destinationKind,
      destinationLocation: r.system.destinationLocation,
      notes: r.system.notes,
    })),
    hardware: hardwareRows
      .filter((r) => r.hardware.status === "active")
      .map((r) => ({
        kind: r.hardware.kind,
        label: r.hardware.label,
        manufacturer: r.hardware.manufacturer,
        model: r.hardware.model,
        serialNumber: r.hardware.serialNumber,
        assetTag: r.hardware.assetTag,
        status: r.hardware.status,
        osName: r.hardware.osName,
        osVersion: r.hardware.osVersion,
        assignedToLabel: r.hardware.assignedToLabel,
        locationLabel: r.locationLabel,
        notes: r.hardware.notes,
      })),
    licenses: licenseRows.map((r) => ({
      productName: r.license.productName,
      sku: r.license.sku,
      vendorName: r.vendorName,
      seatsTotal: r.license.seatsTotal,
      billingPeriod: r.license.billingPeriod,
      renewalDate: r.license.renewalDate,
      rebillRateCents: r.license.rebillRateCents,
    })),
    services: serviceRows.map((r) => ({
      name: r.service.name,
      vendorName: r.vendorName,
      category: r.service.category,
      paidBy: r.service.paidBy,
      accountNumber: r.service.accountNumber,
      supportPhone: r.service.supportPhone,
      supportPortalUrl: r.service.supportPortalUrl,
      renewalDate: r.service.renewalDate,
      monthlyRebillCents: r.service.monthlyRebillRateCents,
      notes: r.service.notes,
    })),
    domains: domainRows.map((d) => ({
      name: d.name,
      registrar: d.registrar,
      expiresAt: d.expiresAt,
      autoRenew: d.autoRenew,
      billable: d.billable,
      notes: d.notes,
    })),
    procedures: procedureRows.map((r) => ({
      title: r.procedure.title,
      kind: r.procedure.kind,
      description: r.procedure.description,
      scheduleNotes: r.procedure.scheduleNotes,
      ownerName: r.ownerName ?? r.ownerEmail ?? null,
      lastRunAt: r.procedure.lastRunAt,
      steps: ((r.procedure.steps ?? []) as ProcedureStep[]).map((s) => ({
        text: s.text,
        hint: s.hint,
      })),
    })),
    recurringTasks: taskRows.map((r) => ({
      title: r.task.title,
      kind: r.task.kind,
      cadenceDays: r.task.cadenceDays,
      nextDueAt: r.task.nextDueAt,
      lastDoneAt: r.task.lastDoneAt,
      ownerName: r.ownerName ?? r.ownerEmail ?? null,
      procedureTitle: r.procedureTitle,
      notes: r.task.notes,
    })),
    recentEvents: eventRows.map((r) => ({
      occurredAt: r.event.occurredAt,
      kind: r.event.kind,
      severity: r.event.severity,
      title: r.event.title,
      narrative: r.event.narrative,
      resolution: r.event.resolution,
      recordedByName: r.recordedByName ?? r.recordedByEmail ?? null,
    })),
    openObservations: obsRows
      .filter((o) => o.status !== "resolved" && o.status !== "wont_fix")
      .map((o) => ({
        title: o.title,
        severity: o.severity,
        status: o.status,
        dueDate: o.dueDate,
        description: o.description,
      })),
  });

  const filename = `${slugify(client.name)}-runbook-${new Date().toISOString().slice(0, 10)}.docx`;
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
