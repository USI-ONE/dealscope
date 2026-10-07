import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { BookOpen, ChevronLeft, ClipboardCheck, FileText, PhoneCall, Shield, Wifi } from "lucide-react";
import { db } from "@/db";
import {
  changeRequests,
  clientAppRegistrations,
  clientBackupStrategy,
  clientBackupSystems,
  clientContacts,
  clientDocuments,
  clientEvents,
  clientIdentities,
  clientLocations,
  clientMailboxes,
  clientNetworkCircuits,
  clientNetworkSegments,
  clientObservations,
  clientPages,
  domains,
  clientProcedureRuns,
  clientProcedures,
  clientRecurringTasks,
  clients,
  hardware,
  licenses,
  memberships,
  ownershipGroups,
  services,
  siteSurveys,
  standards,
  users,
  vendors,
  vendorConnections,
  vendorSeatSnapshots,
  OWNERSHIP_GROUP_KIND_LABEL,
} from "@/db/schema";
import { getOrgMembers, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { ClientAppRegistrationsCard } from "@/components/clients/client-app-registrations-card";
import { ClientContactsCard } from "@/components/clients/client-contacts-card";
import { ClientDocumentsCard } from "@/components/clients/client-documents-card";
import { ClientIdentityCard } from "@/components/clients/client-identity-card";
import { ClientDomainsCard, type DomainRow } from "@/components/clients/client-domains-card";
import { ClientLocationsCard } from "@/components/clients/client-locations-card";
import { ClientMailboxesCard } from "@/components/clients/client-mailboxes-card";
import { ClientObservationsCard } from "@/components/clients/client-observations-card";
import { ClientOverviewCard } from "@/components/clients/client-overview-card";
import { ClientOwnershipGroupCard } from "@/components/clients/client-ownership-group-card";
import { SyncroIntelRollupCard } from "@/components/clients/syncro-intel-rollup-card";
import { AtRiskDevicesCard } from "@/components/clients/at-risk-devices-card";
import { SurveySummaryCard } from "@/components/site-surveys/survey-summary-card";
import { ClientBackupStrategyCard } from "@/components/clients/client-backup-strategy-card";
import { ClientNetworkMapCard } from "@/components/clients/client-network-map-card";
import {
  ClientProceduresCard,
  type ProcedureRow,
  type RunRow,
  type StepResult,
} from "@/components/clients/client-procedures-card";
import {
  ClientRecurringTasksCard,
  type RecurringTaskRow,
} from "@/components/clients/client-recurring-tasks-card";
import {
  ClientEventsCard,
  type EventRow,
} from "@/components/clients/client-events-card";
import {
  ClientHealthBanner,
  type HealthData,
} from "@/components/clients/client-health-banner";
import { getUpcomingItems } from "@/lib/runbook/upcoming";
import { ClientHardwareCard } from "@/components/catalog/client-hardware-card";
import { ClientLicensesCard } from "@/components/catalog/client-licenses-card";
import {
  DetectedLicensesCard,
  type DetectedLicense,
} from "@/components/catalog/detected-licenses-card";
import { VENDOR_CONNECTION_KIND_LABEL } from "@/db/schema";
import { ClientLicenseCategoriesCard } from "@/components/clients/client-license-categories-card";
import { ClientAiAskCard } from "@/components/clients/client-ai-ask-card";
import {
  ClientRunbookPagesCard,
  type RunbookPage,
} from "@/components/clients/client-runbook-pages-card";
import { getConsumingDeviceCounts } from "@/lib/licenses/auto-link";
import { ClientServicesCard } from "@/components/catalog/client-services-card";
import { ContractedSupportCard } from "@/components/finance/contracted-support-card";
import { ProductRebillRatesCard } from "@/components/finance/product-rebill-rates-card";
import { ClientProjectsCard } from "@/components/projects/client-projects-card";
import { projects as projectsTable, projectTasks as projectTasksTable } from "@/db/schema";

export const metadata = { title: "DealScope · Client" };

type TabKey =
  | "overview"
  | "hardware"
  | "apps"
  | "infra"
  | "projects"
  | "runbook";

const TAB_LABEL: Record<TabKey, string> = {
  overview: "Overview",
  hardware: "Hardware",
  apps: "Apps & Licenses",
  infra: "Network & Infra",
  projects: "Projects",
  runbook: "Runbook",
};

const TAB_ORDER: TabKey[] = [
  "overview",
  "hardware",
  "apps",
  "infra",
  "projects",
  "runbook",
];

export default async function TechOsClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: TabKey =
    sp.tab && TAB_ORDER.includes(sp.tab as TabKey)
      ? (sp.tab as TabKey)
      : "overview";
  const ctx = await requireContext();

  // The [id] param accepts either a UUID or a slug — callers vary
  // (some link by `client.id`, some by `client.slug`). Resolving on
  // both keeps every existing link working without changing the URL
  // shape. We detect UUID by regex rather than catching a Postgres
  // "invalid input syntax for type uuid" error.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const client = await db.query.clients.findFirst({
    where: and(
      UUID_RE.test(id) ? eq(clients.id, id) : eq(clients.slug, id),
      eq(clients.organizationId, ctx.organization.id),
    ),
  });
  if (!client) notFound();

  const [
    contacts,
    locations,
    members,
    hardwareRows,
    licenseRows,
    serviceRows,
    vendorOpts,
    identityRow,
    appRegistrations,
    observations,
    documents,
    mailboxes,
    circuitRows,
    segmentRows,
    backupStrategyRow,
    backupSystemRows,
    procedureRows,
    procedureRunRows,
    recurringTaskRows,
    eventRows,
    domainRows,
    runbookPageRows,
  ] = await Promise.all([
    db
      .select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, client.id))
      .orderBy(asc(clientContacts.fullName)),
    db
      .select()
      .from(clientLocations)
      .where(eq(clientLocations.clientId, client.id))
      .orderBy(asc(clientLocations.label)),
    getOrgMembers(ctx.organization.id),
    db
      .select()
      .from(hardware)
      .where(eq(hardware.clientId, client.id))
      .orderBy(asc(hardware.label)),
    db
      .select({
        license: licenses,
        vendorName: vendors.name,
        locationLabel: clientLocations.label,
      })
      .from(licenses)
      .leftJoin(vendors, eq(licenses.vendorId, vendors.id))
      .leftJoin(clientLocations, eq(licenses.locationId, clientLocations.id))
      .where(eq(licenses.clientId, client.id))
      .orderBy(asc(licenses.productName)),
    db
      .select({
        service: services,
        vendorName: vendors.name,
      })
      .from(services)
      .leftJoin(vendors, eq(services.vendorId, vendors.id))
      .where(eq(services.clientId, client.id))
      .orderBy(asc(services.name)),
    db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.organizationId, ctx.organization.id))
      .orderBy(asc(vendors.name)),
    db
      .select()
      .from(clientIdentities)
      .where(eq(clientIdentities.clientId, client.id))
      .limit(1),
    db
      .select()
      .from(clientAppRegistrations)
      .where(eq(clientAppRegistrations.clientId, client.id))
      .orderBy(asc(clientAppRegistrations.displayName)),
    db
      .select()
      .from(clientObservations)
      .where(eq(clientObservations.clientId, client.id))
      .orderBy(asc(clientObservations.createdAt)),
    db
      .select()
      .from(clientDocuments)
      .where(eq(clientDocuments.clientId, client.id))
      .orderBy(asc(clientDocuments.title)),
    db
      .select()
      .from(clientMailboxes)
      .where(eq(clientMailboxes.clientId, client.id))
      .orderBy(asc(clientMailboxes.primaryEmail)),
    db
      .select({
        circuit: clientNetworkCircuits,
        vendorName: vendors.name,
      })
      .from(clientNetworkCircuits)
      .leftJoin(vendors, eq(clientNetworkCircuits.vendorId, vendors.id))
      .where(eq(clientNetworkCircuits.clientId, client.id))
      .orderBy(asc(clientNetworkCircuits.role), asc(clientNetworkCircuits.carrier)),
    db
      .select()
      .from(clientNetworkSegments)
      .where(eq(clientNetworkSegments.clientId, client.id))
      .orderBy(asc(clientNetworkSegments.vlanId), asc(clientNetworkSegments.name)),
    db
      .select()
      .from(clientBackupStrategy)
      .where(eq(clientBackupStrategy.clientId, client.id))
      .limit(1),
    db
      .select({
        system: clientBackupSystems,
        vendorName: vendors.name,
      })
      .from(clientBackupSystems)
      .leftJoin(vendors, eq(clientBackupSystems.vendorId, vendors.id))
      .where(eq(clientBackupSystems.clientId, client.id))
      .orderBy(asc(clientBackupSystems.name)),
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
      .orderBy(asc(clientProcedures.title)),
    db
      .select({
        run: clientProcedureRuns,
        startedByName: users.name,
        startedByEmail: users.email,
      })
      .from(clientProcedureRuns)
      .leftJoin(
        memberships,
        eq(clientProcedureRuns.startedByMembershipId, memberships.id),
      )
      .leftJoin(users, eq(memberships.userId, users.id))
      .where(eq(clientProcedureRuns.clientId, client.id))
      .orderBy(desc(clientProcedureRuns.startedAt)),
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
      .where(eq(clientEvents.clientId, client.id))
      .orderBy(desc(clientEvents.occurredAt)),
    db
      .select()
      .from(domains)
      .where(eq(domains.clientId, client.id))
      .orderBy(asc(domains.name)),
    db
      .select({
        page: clientPages,
        locationLabel: clientLocations.label,
      })
      .from(clientPages)
      .leftJoin(clientLocations, eq(clientPages.locationId, clientLocations.id))
      .where(
        and(
          eq(clientPages.clientId, client.id),
          isNull(clientPages.archivedAt),
        ),
      )
      .orderBy(asc(clientPages.sortOrder), asc(clientPages.title)),
  ]);
  const identity = identityRow[0] ?? null;
  const backupStrategy = backupStrategyRow[0] ?? null;

  // ---- Second wave of independent queries — all parallelized -------
  // Each of these used to run serially after the main Promise.all,
  // adding 5× round-trip latency to the client detail page. Bundling
  // them into one Promise.all cuts that to a single round-trip.
  const [
    consumingDeviceCounts,
    [ownershipGroupOptions, currentOwnershipGroup, inheritedStandards],
    clientSurveys,
    openCountRows,
    allUpcoming,
  ] = await Promise.all([
    // How many devices consume each license (category summary card).
    getConsumingDeviceCounts(
      ctx.organization.id,
      licenseRows.map((r) => r.license.id),
    ),
    // Ownership group dropdowns + inherited standards. Inner Promise.all
    // because the three queries share the same gate (client.ownershipGroupId)
    // and run in parallel themselves.
    Promise.all([
      db
        .select({
          id: ownershipGroups.id,
          name: ownershipGroups.name,
          kind: ownershipGroups.kind,
        })
        .from(ownershipGroups)
        .where(eq(ownershipGroups.organizationId, ctx.organization.id))
        .orderBy(asc(ownershipGroups.name)),
      client.ownershipGroupId
        ? db.query.ownershipGroups.findFirst({
            where: and(
              eq(ownershipGroups.id, client.ownershipGroupId),
              eq(ownershipGroups.organizationId, ctx.organization.id),
            ),
          })
        : Promise.resolve(null),
      client.ownershipGroupId
        ? db
            .select({ id: standards.id, name: standards.name })
            .from(standards)
            .where(
              and(
                eq(standards.ownershipGroupId, client.ownershipGroupId),
                eq(standards.organizationId, ctx.organization.id),
              ),
            )
            .orderBy(asc(standards.name))
        : Promise.resolve([] as { id: string; name: string }[]),
    ]),
    // Recent site surveys for this client — surfaced in a summary card.
    db
      .select()
      .from(siteSurveys)
      .where(
        and(
          eq(siteSurveys.clientId, client.id),
          eq(siteSurveys.organizationId, ctx.organization.id),
        ),
      )
      .orderBy(desc(siteSurveys.scheduledDate))
      .limit(5),
    // Open change request count — drives the summary pill in the header.
    db
      .select({
        openCount: sql<number>`count(*)::int`.as("openCount"),
      })
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.clientId, client.id),
          eq(changeRequests.organizationId, ctx.organization.id),
          sql`${changeRequests.status} IN ('draft','submitted','in_review','approved','scheduled','in_progress','implemented')`,
        ),
      ),
    // All upcoming items org-wide — we filter to this client below.
    // Read org-wide because the helper batches across many sources.
    getUpcomingItems(ctx.organization.id, 365),
  ]);
  const { openCount = 0 } = openCountRows[0] ?? { openCount: 0 };
  // First "network_diagram"-kind document, if any — surfaced on the network
  // map card as a quick-link.
  const networkDiagramDoc = documents.find((d) => d.kind === "network_diagram");

  const canEdit = can("update", "client", { role: ctx.membership.role });
  const canDelete = can("delete", "client", { role: ctx.membership.role });
  const canEditHardware = can("update", "hardware", { role: ctx.membership.role });
  const canEditLicense = can("update", "license", { role: ctx.membership.role });
  const canEditService = can("update", "service", { role: ctx.membership.role });
  // Runbook pages have their own permission so even members (otherwise
  // read-only on client) can contribute to the shared wiki.
  const canEditRunbook = can("update", "client_page", { role: ctx.membership.role });
  const canSeeFinance = can("read", "finance", {
    role: ctx.membership.role,
    financeAccess: ctx.membership.financeAccess,
  });
  const canEditSupport = can("update", "finance", {
    role: ctx.membership.role,
    financeAccess: ctx.membership.financeAccess,
  });

  // Count active hardware per billing tier — drives the contracted-support
  // breakdown.
  const activeHw = hardwareRows.filter((h) => h.status === "active");
  const tierCounts = {
    full_compute_node: activeHw.filter((h) => h.billingTier === "full_compute_node").length,
    kiosk_node: activeHw.filter((h) => h.billingTier === "kiosk_node").length,
    virtual_machine_node: activeHw.filter((h) => h.billingTier === "virtual_machine_node").length,
    managed_mobile_device: activeHw.filter((h) => h.billingTier === "managed_mobile_device").length,
  };

  // Per-vendor active-seat snapshot — drives the rebill-rate card's
  // projected math. We grab the LATEST snapshot per (vendor_kind ×
  // product_sku) so it tracks fresh data as connectors sync.
  // Falls through to zero when no snapshot exists.
  const latestSeatsByKind = await db
    .select({
      kind: vendorConnections.kind,
      productSku: vendorSeatSnapshots.productSku,
      productName: sql<string>`(
        array_agg(${vendorSeatSnapshots.productName} order by ${vendorSeatSnapshots.capturedAt} desc)
      )[1]`.as("productName"),
      seats: sql<number>`(
        array_agg(${vendorSeatSnapshots.seats} order by ${vendorSeatSnapshots.capturedAt} desc)
      )[1]::int`.as("seats"),
      capturedAt: sql<Date>`max(${vendorSeatSnapshots.capturedAt})`.as(
        "capturedAt",
      ),
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
  // Roll up to one number per product family. Some vendors emit
  // multiple SKUs per family (Bitdefender ATS / EDR / MDR rows, TitanHQ
  // Issued + Active) — take the max so the projected math represents
  // the broadest billable footprint.
  const seatsByKind = (kindNeedle: string, skuNeedle: string | null = null) =>
    latestSeatsByKind
      .filter((r) => r.kind.includes(kindNeedle))
      .filter((r) => (skuNeedle ? r.productSku.includes(skuNeedle) : true))
      .reduce((max, r) => Math.max(max, r.seats ?? 0), 0);

  // Build the detected-licenses table: each (kind × SKU) snapshot →
  // one card row. Mark rows that already have a corresponding
  // licenses entry so the operator sees "Linked" instead of "Add".
  const linkedSkus = new Set(
    licenseRows.map((r) => r.license.sku).filter((s): s is string => !!s),
  );
  const detectedLicenses: DetectedLicense[] = latestSeatsByKind
    // Skip detections that didn't return seats > 0 — those are
    // empty bookkeeping rows from a connector (e.g. Liongard's
    // environment-count metadata).
    .filter((r) => (r.seats ?? 0) > 0)
    .map((r) => ({
      kind: r.kind,
      kindLabel:
        VENDOR_CONNECTION_KIND_LABEL[
          r.kind as keyof typeof VENDOR_CONNECTION_KIND_LABEL
        ] ?? r.kind,
      productSku: r.productSku,
      productName: r.productName ?? r.productSku,
      seats: r.seats,
      lastSync: r.capturedAt
        ? new Date(r.capturedAt).toISOString().slice(0, 10)
        : null,
      alreadyLinked: linkedSkus.has(r.productSku),
    }))
    .sort((a, b) => {
      // Unlinked first, then alphabetical by integration label.
      if (a.alreadyLinked !== b.alreadyLinked) {
        return a.alreadyLinked ? 1 : -1;
      }
      return (
        a.kindLabel.localeCompare(b.kindLabel) ||
        a.productName.localeCompare(b.productName)
      );
    });

  // ---- Health summary computation -------------------------------------
  // allUpcoming was fetched in the parallel block above; filter here.
  const myUpcoming = allUpcoming.filter((u) => u.clientId === client.id);
  const overdueCount = myUpcoming.filter((u) => u.daysFromToday < 0).length;
  const upcoming30 = myUpcoming.filter(
    (u) => u.daysFromToday >= 0 && u.daysFromToday <= 30,
  ).length;
  const upcoming60 = myUpcoming.filter(
    (u) => u.daysFromToday >= 0 && u.daysFromToday <= 60,
  ).length;
  const upcoming90 = myUpcoming.filter(
    (u) => u.daysFromToday >= 0 && u.daysFromToday <= 90,
  ).length;
  // Hardware not seen in 14+ days (and where a last_seen_at exists).
  const STALE_DAYS = 14;
  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  const staleHardwareCount = hardwareRows.filter(
    (h) =>
      h.status === "active" &&
      h.lastSeenAt &&
      new Date(h.lastSeenAt).getTime() < cutoff,
  ).length;
  // Count open observations + bucket by severity.
  const openObs = observations.filter(
    (o) => o.status !== "resolved" && o.status !== "wont_fix",
  );
  const observationsBySeverity: HealthData["observationsBySeverity"] = {};
  for (const o of openObs) {
    observationsBySeverity[o.severity] =
      (observationsBySeverity[o.severity] ?? 0) + 1;
  }
  // Runbook gaps — what "should be there" but isn't.
  const missingDataFlags: string[] = [];
  if (!identity) missingDataFlags.push("Identity not configured");
  if (identity && !identity.tenantId) missingDataFlags.push("Tenant ID missing");
  if (!backupStrategy) missingDataFlags.push("Backup strategy not set");
  if (backupStrategy && !backupStrategy.offsiteCopy)
    missingDataFlags.push("No offsite backup copy");
  if (circuitRows.length === 0)
    missingDataFlags.push("No internet circuits documented");
  if (locations.length === 0) missingDataFlags.push("No locations on file");
  const healthData: HealthData = {
    observationsBySeverity,
    observationsTotal: openObs.length,
    upcoming30,
    upcoming60,
    upcoming90,
    overdue: overdueCount,
    staleHardwareCount,
    missingDataFlags,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <Link
            href="/clients"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> Back to clients
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{client.name}</h1>
          {client.primaryDomain && (
            <p className="text-muted-foreground">{client.primaryDomain}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clients/${client.id}/changes`}>
              <ClipboardCheck className="mr-1 size-3.5" /> Change requests
              {openCount > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                  {openCount}
                </span>
              )}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clients/${client.id}/security`}>
              <Shield className="mr-1 size-3.5" /> Security posture
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clients/${client.id}/voice`}>
              <PhoneCall className="mr-1 size-3.5" /> Voice
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clients/${client.id}/internet`}>
              <Wifi className="mr-1 size-3.5" /> Internet
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clients/${client.id}/compliance`}>
              <ClipboardCheck className="mr-1 size-3.5" /> Compliance
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clients/${client.id}/billing`}>
              <FileText className="mr-1 size-3.5" /> Monthly Statement
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/clients/${client.id}/runbook/export.docx`}
              title="Download a full client runbook (.docx)"
            >
              <BookOpen className="mr-1 size-3.5" /> Download runbook
            </a>
          </Button>
        </div>
      </div>

      <ClientHealthBanner data={healthData} clientId={client.id} />

      {/* Tab navigation — server-side via URL ?tab=. Keeps page
          server-rendered + tabs shareable / bookmarkable. */}
      <nav className="flex flex-wrap items-center gap-1 border-b">
        {TAB_ORDER.map((t) => {
          const active = t === tab;
          return (
            <Link
              key={t}
              href={t === "overview" ? `/clients/${client.id}` : `/clients/${client.id}?tab=${t}`}
              className={
                "rounded-t-md border-x border-t px-3 py-1.5 text-sm transition-colors " +
                (active
                  ? "border-border bg-card font-medium text-foreground -mb-px"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {TAB_LABEL[t]}
            </Link>
          );
        })}
      </nav>

      {/* ============================================================
          OVERVIEW TAB — health, identity, contacts, locations
          ============================================================ */}
      {tab === "overview" && (
        <>
          <ClientOverviewCard
            client={{
              id: client.id,
              name: client.name,
              slug: client.slug,
              status: client.status,
              primaryDomain: client.primaryDomain,
              industry: client.industry,
              location: client.location,
              autoelevateStatus: client.autoelevateStatus,
              accountManagerMembershipId: client.accountManagerMembershipId,
              syncroCustomerId: client.syncroCustomerId,
              monthlyRecurringCents: client.monthlyRecurringCents,
              notes: client.notes,
              archivedAt: client.archivedAt,
            }}
            members={members}
            canEdit={canEdit}
            canDelete={canDelete}
          />

          <ClientOwnershipGroupCard
            clientId={client.id}
            currentGroup={
              currentOwnershipGroup
                ? {
                    id: currentOwnershipGroup.id,
                    name: currentOwnershipGroup.name,
                    kind:
                      OWNERSHIP_GROUP_KIND_LABEL[currentOwnershipGroup.kind] ??
                      currentOwnershipGroup.kind,
                  }
                : null
            }
            groups={ownershipGroupOptions.map((g) => ({
              id: g.id,
              name: g.name,
              kind: OWNERSHIP_GROUP_KIND_LABEL[g.kind] ?? g.kind,
            }))}
            inheritedStandards={inheritedStandards}
            canEdit={canEdit}
          />

          <AtRiskDevicesCard
            hardware={hardwareRows.map((h) => ({
              id: h.id,
              label: h.label,
              kind: h.kind,
              status: h.status,
              assetTag: h.assetTag,
              serialNumber: h.serialNumber,
              assignedToLabel: h.assignedToLabel,
              locationLabel:
                locations.find((l) => l.id === h.locationId)?.label ?? null,
              osName: h.osName,
              osVersion: h.osVersion,
              isEol: h.isEol,
              eolDate: h.eolDate,
              warrantyEndsAt: h.warrantyEndsAt,
              lastSeenAt: h.lastSeenAt,
              windows11Readiness: h.windows11Readiness,
              intuneEnrolled: h.intuneEnrolled,
              entraJoined: h.entraJoined,
              notOnContract: h.notOnContract,
            }))}
          />

          {client.syncroCustomerId && (
            <SyncroIntelRollupCard
              hardware={hardwareRows.map((h) => ({
                status: h.status,
                autoelevateStatus: h.autoelevateStatus,
                intuneEnrolled: h.intuneEnrolled,
                entraJoined: h.entraJoined,
                threatlockerRunning: h.threatlockerRunning,
                isKiosk: h.isKiosk,
                notOnContract: h.notOnContract,
                windows11Readiness: h.windows11Readiness,
              }))}
              latestCsat={client.latestCsat}
              latestCsatComment={client.latestCsatComment}
            />
          )}

          <SurveySummaryCard
            scope={{ kind: "client", clientId: client.id }}
            surveys={clientSurveys}
            canEdit={canEdit}
          />

          {canEditSupport && (
            <ContractedSupportCard
              initial={{
                clientId: client.id,
                supportBaselineCents: client.supportBaselineCents,
                supportRateFullComputeCents: client.supportRateFullComputeCents,
                supportRateKioskCents: client.supportRateKioskCents,
                supportRateVmCents: client.supportRateVmCents,
                supportRateManagedMobileCents: client.supportRateManagedMobileCents,
                supportRateAdditionalUserCents: client.supportRateAdditionalUserCents,
                additionalUserCount: client.additionalUserCount,
                fullComputeCount: tierCounts.full_compute_node,
                kioskCount: tierCounts.kiosk_node,
                vmCount: tierCounts.virtual_machine_node,
                managedMobileCount: tierCounts.managed_mobile_device,
              }}
            />
          )}

          {canEditSupport && (
            <ProductRebillRatesCard
              initial={{
                clientId: client.id,
                rebillRateBitdefenderCents: client.rebillRateBitdefenderCents,
                rebillRateLiongardCents: client.rebillRateLiongardCents,
                rebillRateTitanhqCents: client.rebillRateTitanhqCents,
                rebillRateSyncroRemoteCents: client.rebillRateSyncroRemoteCents,
                // Active seats from the latest snapshot per family —
                // matches what the PS generator will use at run-time.
                bitdefenderSeats: seatsByKind("bitdefender"),
                liongardSeats: seatsByKind("liongard"),
                // TitanHQ ingests two SKUs per row (issued + active);
                // we want the active count for billing.
                titanhqSeats: seatsByKind("titanhq", "active"),
                syncroRemoteContacts: seatsByKind("syncro", "remote"),
              }}
            />
          )}

          <ClientObservationsCard
            clientId={client.id}
            observations={observations.map((o) => ({
              id: o.id,
              title: o.title,
              description: o.description,
              kind: o.kind,
              severity: o.severity,
              status: o.status,
              assignedToMembershipId: o.assignedToMembershipId,
              dueDate: o.dueDate,
              resolvedAt: o.resolvedAt,
              notes: o.notes,
            }))}
            members={members}
            canEdit={canEdit}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <ClientContactsCard
              clientId={client.id}
              contacts={contacts.map((c) => ({
                id: c.id,
                fullName: c.fullName,
                title: c.title,
                email: c.email,
                phone: c.phone,
                isPrimary: c.isPrimary,
                notes: c.notes,
              }))}
              canEdit={canEdit}
            />
            <ClientLocationsCard
              clientId={client.id}
              locations={locations.map((l) => ({
                id: l.id,
                label: l.label,
                addressLine1: l.addressLine1,
                addressLine2: l.addressLine2,
                city: l.city,
                region: l.region,
                postalCode: l.postalCode,
                country: l.country,
                isPrimary: l.isPrimary,
                notes: l.notes,
              }))}
              canEdit={canEdit}
            />
          </div>
        </>
      )}

      {/* ============================================================
          HARDWARE TAB — devices, lifecycle, asset details
          ============================================================ */}
      {tab === "hardware" && (
        <>
          <ClientHardwareCard
            clientId={client.id}
            hardware={hardwareRows.map((h) => ({
              id: h.id,
              kind: h.kind,
              label: h.label,
              manufacturer: h.manufacturer,
              model: h.model,
              serialNumber: h.serialNumber,
              assetTag: h.assetTag,
              status: h.status,
              billingTier: h.billingTier,
              purchasedAt: h.purchasedAt,
              warrantyEndsAt: h.warrantyEndsAt,
              osName: h.osName,
              osVersion: h.osVersion,
              cpuLabel: h.cpuLabel,
              ramGb: h.ramGb,
              diskGb: h.diskGb,
              lastIp: h.lastIp,
              lastSeenAt: h.lastSeenAt,
              isEol: h.isEol,
              eolDate: h.eolDate,
              rmmAgent: h.rmmAgent,
              edrAgent: h.edrAgent,
              backupAgent: h.backupAgent,
              assignedToLabel: h.assignedToLabel,
              assignedToEmail: h.assignedToEmail,
              onePasswordItemUrl: h.onePasswordItemUrl,
              notes: h.notes,
              locationId: h.locationId,
              locationLabel: null,
              vendorId: h.vendorId,
              syncroAssetId: h.syncroAssetId,
              notOnContract: h.notOnContract,
              isKiosk: h.isKiosk,
              autoelevateStatus: h.autoelevateStatus,
              intuneEnrolled: h.intuneEnrolled,
              entraJoined: h.entraJoined,
              threatlockerRunning: h.threatlockerRunning,
              windows11Readiness: h.windows11Readiness,
              customerAssetTag: h.customerAssetTag,
              usiAssetTag: h.usiAssetTag,
              splashtopUuid: h.splashtopUuid,
              localAdministrators: h.localAdministrators,
              imei: h.imei,
            }))}
            locations={locations.map((l) => ({ id: l.id, label: l.label }))}
            vendors={vendorOpts}
            canEdit={canEditHardware}
          />
        </>
      )}

      {/* ============================================================
          APPS & LICENSES TAB — licenses, services, domains, M365 apps
          ============================================================ */}
      {tab === "apps" && (
        <>
          <ClientLicenseCategoriesCard
            licenses={licenseRows
              .filter((r) => r.license.status === "active")
              .map((r) => ({
                id: r.license.id,
                productName: r.license.productName,
                vendorName: r.vendorName,
                category: r.license.category,
                seatsTotal: r.license.seatsTotal,
                rebillRateCents: r.license.rebillRateCents,
                consumingDeviceCount:
                  consumingDeviceCounts.get(r.license.id) ?? 0,
              }))}
          />

          <DetectedLicensesCard
            clientId={client.id}
            detected={detectedLicenses}
            canEdit={canEditLicense}
          />

          <ClientLicensesCard
            clientId={client.id}
            licenses={licenseRows.map((r) => ({
              id: r.license.id,
              productName: r.license.productName,
              sku: r.license.sku,
              vendorId: r.license.vendorId,
              vendorName: r.vendorName,
              locationId: r.license.locationId,
              locationLabel: r.locationLabel,
              seatsTotal: r.license.seatsTotal,
              billingPeriod: r.license.billingPeriod,
              status: r.license.status,
              renewalDate: r.license.renewalDate,
              rebillRateCents: r.license.rebillRateCents,
              // Strip cost fields for non-finance roles.
              costBasisCents: canSeeFinance ? r.license.costBasisCents : null,
              markupPct: canSeeFinance ? r.license.markupPct : null,
              onePasswordItemUrl: r.license.onePasswordItemUrl,
              notes: r.license.notes,
            }))}
            vendors={vendorOpts}
            locations={locations.map((l) => ({ id: l.id, label: l.label }))}
            canEdit={canEditLicense}
            canSeeFinance={canSeeFinance}
          />

          <ClientServicesCard
            clientId={client.id}
            services={serviceRows.map((r) => ({
              id: r.service.id,
              name: r.service.name,
              description: r.service.description,
              vendorId: r.service.vendorId,
              vendorName: r.vendorName,
              kind: r.service.kind,
              category: r.service.category,
              status: r.service.status,
              paidBy: r.service.paidBy,
              startsAt: r.service.startsAt,
              endsAt: r.service.endsAt,
              monthlyRebillRateCents: r.service.monthlyRebillRateCents,
              // Strip cost fields for non-finance roles.
              costBasisCents: canSeeFinance ? r.service.costBasisCents : null,
              markupPct: canSeeFinance ? r.service.markupPct : null,
              accountNumber: r.service.accountNumber,
              supportPhone: r.service.supportPhone,
              supportEmail: r.service.supportEmail,
              supportPortalUrl: r.service.supportPortalUrl,
              vendorContactName: r.service.vendorContactName,
              vendorContactPhone: r.service.vendorContactPhone,
              vendorContactEmail: r.service.vendorContactEmail,
              loginUsername: r.service.loginUsername,
              onePasswordItemUrl: r.service.onePasswordItemUrl,
              notes: r.service.notes,
            }))}
            vendors={vendorOpts}
            canEdit={canEditService}
            canSeeFinance={canSeeFinance}
          />

          <ClientDomainsCard
            clientId={client.id}
            domains={domainRows.map((d): DomainRow => ({
              id: d.id,
              name: d.name,
              registrar: d.registrar,
              vendorId: d.vendorId,
              registrarServiceId: d.registrarServiceId,
              expiresAt: d.expiresAt,
              autoRenew: d.autoRenew,
              billable: d.billable,
              rebillRateCents: d.rebillRateCents,
              onePasswordItemUrl: d.onePasswordItemUrl,
              notes: d.notes,
            }))}
            vendors={vendorOpts}
            registrarServices={serviceRows
              .filter((s) => s.service.category === "domain_registrar")
              .map((s) => ({ id: s.service.id, name: s.service.name }))}
            canEdit={canEdit}
          />

          <ClientAppRegistrationsCard
            clientId={client.id}
            appRegistrations={appRegistrations.map((a) => ({
              id: a.id,
              applicationId: a.applicationId,
              displayName: a.displayName,
              appCreatedAt: a.appCreatedAt,
              secretStatus: a.secretStatus,
              secretExpiresAt: a.secretExpiresAt,
              certStatus: a.certStatus,
              certExpiresAt: a.certExpiresAt,
              status: a.status,
              purpose: a.purpose,
              flagForReview: a.flagForReview,
              notes: a.notes,
            }))}
            canEdit={canEdit}
          />

          <ClientMailboxesCard
            clientId={client.id}
            mailboxes={mailboxes.map((m) => ({
              id: m.id,
              primaryEmail: m.primaryEmail,
              displayName: m.displayName,
              kind: m.kind,
              aliases: m.aliases,
              litigationHold: m.litigationHold,
              licenseSummary: m.licenseSummary,
              delegatedToEmail: m.delegatedToEmail,
              notes: m.notes,
            }))}
            canEdit={canEdit}
          />
        </>
      )}

      {/* ============================================================
          NETWORK & INFRA TAB — circuits, segments, backup, identity
          ============================================================ */}
      {tab === "infra" && (
        <>
          <ClientNetworkMapCard
            clientId={client.id}
            circuits={circuitRows.map((r) => ({
              id: r.circuit.id,
              locationId: r.circuit.locationId,
              role: r.circuit.role,
              carrier: r.circuit.carrier,
              productLabel: r.circuit.productLabel,
              speedDownMbps: r.circuit.speedDownMbps,
              speedUpMbps: r.circuit.speedUpMbps,
              staticIpRange: r.circuit.staticIpRange,
              accountNumber: r.circuit.accountNumber,
              supportPhone: r.circuit.supportPhone,
              supportPortalUrl: r.circuit.supportPortalUrl,
              termEndsAt: r.circuit.termEndsAt,
              monthlyCostCents: canSeeFinance ? r.circuit.monthlyCostCents : null,
              vendorId: r.circuit.vendorId,
              vendorName: r.vendorName,
              serviceId: r.circuit.serviceId,
              onePasswordItemUrl: r.circuit.onePasswordItemUrl,
              notes: r.circuit.notes,
            }))}
            segments={segmentRows.map((s) => ({
              id: s.id,
              locationId: s.locationId,
              name: s.name,
              vlanId: s.vlanId,
              subnet: s.subnet,
              gateway: s.gateway,
              dhcpScope: s.dhcpScope,
              isolatedFromCorp: s.isolatedFromCorp,
              purpose: s.purpose,
              notes: s.notes,
            }))}
            locations={locations.map((l) => ({ id: l.id, label: l.label }))}
            vendors={vendorOpts}
            networkDiagramUrl={networkDiagramDoc?.url ?? null}
            canEdit={canEdit}
            canSeeFinance={canSeeFinance}
          />

          <ClientBackupStrategyCard
            clientId={client.id}
            strategy={
              backupStrategy
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
                : null
            }
            systems={backupSystemRows.map((r) => ({
              id: r.system.id,
              name: r.system.name,
              vendorId: r.system.vendorId,
              vendorName: r.vendorName,
              serviceId: r.system.serviceId,
              scopeKinds: r.system.scopeKinds,
              scopeNotes: r.system.scopeNotes,
              frequency: r.system.frequency,
              retention: r.system.retention,
              destinationKind: r.system.destinationKind,
              destinationLocation: r.system.destinationLocation,
              monitoringNotes: r.system.monitoringNotes,
              onePasswordItemUrl: r.system.onePasswordItemUrl,
              notes: r.system.notes,
            }))}
            vendors={vendorOpts}
            canEdit={canEdit}
          />

          <ClientIdentityCard
            clientId={client.id}
            identity={
              identity
                ? {
                    id: identity.id,
                    identityProvider: identity.identityProvider,
                    primaryDomain: identity.primaryDomain,
                    tenantDefaultDomain: identity.tenantDefaultDomain,
                    tenantId: identity.tenantId,
                    domainRegistrar: identity.domainRegistrar,
                    directorySync: identity.directorySync,
                    mfaPosture: identity.mfaPosture,
                    conditionalAccessNotes: identity.conditionalAccessNotes,
                    ssoConsumers: identity.ssoConsumers,
                    notes: identity.notes,
                  }
                : null
            }
            canEdit={canEdit}
          />
        </>
      )}

      {/* ============================================================
          PROJECTS TAB — engagements + deliverables for this client
          ============================================================ */}
      {tab === "projects" && (
        <ProjectsTabContent
          clientId={client.id}
          organizationId={ctx.organization.id}
          canEdit={can("update", "project", { role: ctx.membership.role })}
        />
      )}

      {/* ============================================================
          RUNBOOK TAB — AI assistant, wiki pages, docs, procedures,
          recurring tasks, event log
          ============================================================ */}
      {tab === "runbook" && (
        <>
          <ClientAiAskCard clientId={client.id} clientName={client.name} />

          <ClientRunbookPagesCard
            clientId={client.id}
            canEdit={canEditRunbook}
            locations={locations.map((l) => ({ id: l.id, label: l.label }))}
            pages={runbookPageRows.map((r): RunbookPage => ({
              id: r.page.id,
              title: r.page.title,
              kind: r.page.kind,
              bodyMd: r.page.bodyMd,
              source: r.page.source,
              sourcePath: r.page.sourcePath,
              locationLabel: r.locationLabel,
              locationId: r.page.locationId,
              parentPageId: r.page.parentPageId,
              updatedAt: r.page.updatedAt,
            }))}
          />

          <ClientDocumentsCard
            clientId={client.id}
            documents={documents.map((d) => ({
              id: d.id,
              title: d.title,
              kind: d.kind,
              url: d.url,
              description: d.description,
            }))}
            canEdit={canEdit}
          />

          <ClientProceduresCard
            clientId={client.id}
            procedures={procedureRows.map((p): ProcedureRow => {
              const myRuns: RunRow[] = procedureRunRows
                .filter((r) => r.run.procedureId === p.procedure.id)
                .map((r) => ({
                  id: r.run.id,
                  status: r.run.status,
                  startedAt: r.run.startedAt,
                  completedAt: r.run.completedAt,
                  startedByName: r.startedByName ?? r.startedByEmail ?? null,
                  stepResults: (r.run.stepResults ?? []) as StepResult[],
                  outcomeNotes: r.run.outcomeNotes,
                  durationMinutes: r.run.durationMinutes,
                }));
              return {
                id: p.procedure.id,
                title: p.procedure.title,
                kind: p.procedure.kind,
                description: p.procedure.description,
                steps: (p.procedure.steps ?? []) as ProcedureRow["steps"],
                ownerMembershipId: p.procedure.ownerMembershipId,
                ownerName: p.ownerName ?? p.ownerEmail ?? null,
                scheduleNotes: p.procedure.scheduleNotes,
                lastRunAt: p.procedure.lastRunAt,
                runs: myRuns,
              };
            })}
            members={members}
            canEdit={canEdit}
          />

          <ClientRecurringTasksCard
            clientId={client.id}
            tasks={recurringTaskRows.map((r): RecurringTaskRow => ({
              id: r.task.id,
              title: r.task.title,
              kind: r.task.kind,
              cadenceDays: r.task.cadenceDays,
              nextDueAt: r.task.nextDueAt,
              lastDoneAt: r.task.lastDoneAt,
              ownerMembershipId: r.task.ownerMembershipId,
              ownerName: r.ownerName ?? r.ownerEmail ?? null,
              procedureId: r.task.procedureId,
              procedureTitle: r.procedureTitle,
              notes: r.task.notes,
            }))}
            members={members}
            procedures={procedureRows.map((p) => ({
              id: p.procedure.id,
              title: p.procedure.title,
            }))}
            canEdit={canEdit}
          />

          <ClientEventsCard
            clientId={client.id}
            events={eventRows.map((r): EventRow => ({
              id: r.event.id,
              occurredAt: r.event.occurredAt,
              kind: r.event.kind,
              severity: r.event.severity,
              title: r.event.title,
              narrative: r.event.narrative,
              rootCause: r.event.rootCause,
              resolution: r.event.resolution,
              durationMinutes: r.event.durationMinutes,
              affectedSystems: (r.event.affectedSystems ?? []) as string[],
              recordedByName: r.recordedByName ?? r.recordedByEmail ?? null,
              resolvedAt: r.event.resolvedAt,
            }))}
            canEdit={canEdit}
          />
        </>
      )}
    </div>
  );
}

/**
 * Projects tab content for /clients/[id]?tab=projects. Server-rendered
 * inline so its DB queries only run when the operator is actually on
 * that tab — keeps the cold-load of the rest of the client page
 * unaffected by the project list.
 */
async function ProjectsTabContent({
  clientId,
  organizationId,
  canEdit,
}: {
  clientId: string;
  organizationId: string;
  canEdit: boolean;
}) {
  const [projRows, taskRollupRows] = await Promise.all([
    db
      .select({
        id: projectsTable.id,
        code: projectsTable.code,
        name: projectsTable.name,
        kind: projectsTable.kind,
        status: projectsTable.status,
        health: projectsTable.health,
        summary: projectsTable.summary,
        plannedStartDate: projectsTable.plannedStartDate,
        plannedEndDate: projectsTable.plannedEndDate,
        archivedAt: projectsTable.archivedAt,
      })
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.organizationId, organizationId),
          eq(projectsTable.clientId, clientId),
        ),
      )
      .orderBy(desc(projectsTable.createdAt)),
    db
      .select({
        projectId: projectTasksTable.projectId,
        status: projectTasksTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(projectTasksTable)
      .where(eq(projectTasksTable.organizationId, organizationId))
      .groupBy(projectTasksTable.projectId, projectTasksTable.status),
  ]);

  // Roll up tasks → { total, done } per project so we can render % bars.
  const rollupByProject = new Map<
    string,
    { total: number; done: number }
  >();
  for (const r of taskRollupRows) {
    const cur = rollupByProject.get(r.projectId) ?? { total: 0, done: 0 };
    cur.total += r.count;
    if (r.status === "done") cur.done += r.count;
    rollupByProject.set(r.projectId, cur);
  }

  return (
    <ClientProjectsCard
      clientId={clientId}
      canEdit={canEdit}
      projects={projRows.map((p) => {
        const r = rollupByProject.get(p.id) ?? { total: 0, done: 0 };
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          kind: p.kind,
          status: p.status,
          health: p.health,
          summary: p.summary,
          plannedStartDate: p.plannedStartDate,
          plannedEndDate: p.plannedEndDate,
          archivedAt: p.archivedAt,
          totalTasks: r.total,
          doneTasks: r.done,
          percentComplete:
            r.total > 0 ? Math.round((r.done / r.total) * 100) : 0,
        };
      })}
    />
  );
}
