/**
 * Unified loader for the staffing module.
 *
 * Returns everything the dashboard / clients / forecast pages need in
 * one shape, joining clients ↔ profiles, staff ↔ assignments, and
 * initiatives. Uses batched queries — no N+1.
 */
import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  clientStaffingProfiles,
  clients,
  staffAssignments,
  staffMembers,
  strategicInitiatives,
} from "@/db/schema";
import type {
  AutomationMaturity,
  StrategicIntensity,
  SupportIntensity,
} from "./calc";

export type StaffingClientRow = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  archived: boolean;
  profileId: string | null;
  userCount: number;
  sites: number;
  servers: number;
  apps: number;
  automationMaturity: AutomationMaturity;
  strategicIntensity: StrategicIntensity;
  supportIntensity: SupportIntensity;
  tier1Fte: number;
  tier2Fte: number;
  tier3Fte: number;
  totalFte: number;
  /** Resolved from clients/hardware/locations/app-registrations the first
   *  time a profile is created — gives the user a sane starting point. */
  suggestedSites: number;
  suggestedServers: number;
  suggestedApps: number;
  profileUpdatedAt: Date | null;
  notes: string | null;
};

export type StaffMemberRow = {
  id: string;
  name: string;
  email: string | null;
  tier: number;
  capacityFte: number;
  annualCostCents: number | null;
  notes: string | null;
  /** Total FTE this person is allocated across all their assignments. */
  totalAllocatedFte: number;
  assignments: Array<{
    clientId: string;
    clientName: string;
    allocatedFte: number;
  }>;
};

export type InitiativeRow = {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  tier3FteRequired: number;
  startDate: string | null;
  endDate: string | null;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
};

export type StaffingState = {
  clients: StaffingClientRow[];
  staff: StaffMemberRow[];
  initiatives: InitiativeRow[];
};

/**
 * Suggest starting values for a brand-new profile by counting existing
 * TechOS data for that client.
 */
async function loadSuggestionMap(
  organizationId: string,
): Promise<Map<string, { sites: number; servers: number; apps: number }>> {
  // Run three count queries in parallel — each grouped by clientId.
  const { hardware, clientLocations, clientAppRegistrations } = await import(
    "@/db/schema"
  );
  const { count } = await import("drizzle-orm");

  const [serverCounts, locationCounts, appCounts] = await Promise.all([
    db
      .select({
        clientId: hardware.clientId,
        n: count(hardware.id).as("n"),
      })
      .from(hardware)
      .where(
        and(
          eq(hardware.organizationId, organizationId),
          eq(hardware.kind, "server"),
          eq(hardware.status, "active"),
        ),
      )
      .groupBy(hardware.clientId),
    db
      .select({
        clientId: clientLocations.clientId,
        n: count(clientLocations.id).as("n"),
      })
      .from(clientLocations)
      .where(eq(clientLocations.organizationId, organizationId))
      .groupBy(clientLocations.clientId),
    db
      .select({
        clientId: clientAppRegistrations.clientId,
        n: count(clientAppRegistrations.id).as("n"),
      })
      .from(clientAppRegistrations)
      .where(eq(clientAppRegistrations.organizationId, organizationId))
      .groupBy(clientAppRegistrations.clientId),
  ]);

  const out = new Map<
    string,
    { sites: number; servers: number; apps: number }
  >();
  const upsert = (cid: string) => {
    const cur = out.get(cid) ?? { sites: 0, servers: 0, apps: 0 };
    out.set(cid, cur);
    return cur;
  };
  for (const r of serverCounts) upsert(r.clientId).servers = Number(r.n);
  for (const r of locationCounts) upsert(r.clientId).sites = Number(r.n);
  for (const r of appCounts) upsert(r.clientId).apps = Number(r.n);
  return out;
}

export async function loadStaffingState(
  organizationId: string,
): Promise<StaffingState> {
  const [profileRows, staffRows, assignmentRows, initiativeRows, suggestionMap] =
    await Promise.all([
      db
        .select({
          client: clients,
          profile: clientStaffingProfiles,
        })
        .from(clients)
        .leftJoin(
          clientStaffingProfiles,
          eq(clientStaffingProfiles.clientId, clients.id),
        )
        .where(
          and(
            eq(clients.organizationId, organizationId),
            isNull(clients.archivedAt),
          ),
        )
        .orderBy(asc(clients.name)),
      db
        .select()
        .from(staffMembers)
        .where(eq(staffMembers.organizationId, organizationId))
        .orderBy(asc(staffMembers.tier), asc(staffMembers.name)),
      db
        .select({
          assignment: staffAssignments,
          clientName: clients.name,
        })
        .from(staffAssignments)
        .innerJoin(clients, eq(staffAssignments.clientId, clients.id))
        .where(eq(staffAssignments.organizationId, organizationId)),
      db
        .select({
          initiative: strategicInitiatives,
          clientName: clients.name,
        })
        .from(strategicInitiatives)
        .leftJoin(clients, eq(strategicInitiatives.clientId, clients.id))
        .where(eq(strategicInitiatives.organizationId, organizationId))
        .orderBy(asc(strategicInitiatives.startDate)),
      loadSuggestionMap(organizationId),
    ]);

  const clientRows: StaffingClientRow[] = profileRows.map((r) => {
    const sug = suggestionMap.get(r.client.id) ?? {
      sites: 1,
      servers: 0,
      apps: 0,
    };
    const p = r.profile;
    const tier1 = Number(p?.tier1Fte ?? 0);
    const tier2 = Number(p?.tier2Fte ?? 0);
    const tier3 = Number(p?.tier3Fte ?? 0);
    return {
      clientId: r.client.id,
      clientName: r.client.name,
      clientSlug: r.client.slug,
      archived: !!r.client.archivedAt,
      profileId: p?.id ?? null,
      userCount: p?.userCount ?? 0,
      sites: p?.sites ?? (sug.sites || 1),
      servers: p?.servers ?? sug.servers,
      apps: p?.apps ?? sug.apps,
      automationMaturity: p?.automationMaturity ?? "manual",
      strategicIntensity: p?.strategicIntensity ?? "none",
      supportIntensity: p?.supportIntensity ?? "standard",
      tier1Fte: tier1,
      tier2Fte: tier2,
      tier3Fte: tier3,
      totalFte: tier1 + tier2 + tier3,
      suggestedSites: Math.max(1, sug.sites),
      suggestedServers: sug.servers,
      suggestedApps: sug.apps,
      profileUpdatedAt: p?.updatedAt ?? null,
      notes: p?.notes ?? null,
    };
  });

  const assignmentsByStaff = new Map<
    string,
    Array<{ clientId: string; clientName: string; allocatedFte: number }>
  >();
  for (const a of assignmentRows) {
    const arr = assignmentsByStaff.get(a.assignment.staffMemberId) ?? [];
    arr.push({
      clientId: a.assignment.clientId,
      clientName: a.clientName,
      allocatedFte: Number(a.assignment.allocatedFte),
    });
    assignmentsByStaff.set(a.assignment.staffMemberId, arr);
  }

  const staff: StaffMemberRow[] = staffRows.map((s) => {
    const list = assignmentsByStaff.get(s.id) ?? [];
    return {
      id: s.id,
      name: s.name,
      email: s.email,
      tier: s.tier,
      capacityFte: Number(s.capacityFte),
      annualCostCents: s.annualCostCents,
      notes: s.notes,
      totalAllocatedFte: list.reduce((sum, a) => sum + a.allocatedFte, 0),
      assignments: list,
    };
  });

  const initiatives: InitiativeRow[] = initiativeRows.map((r) => ({
    id: r.initiative.id,
    name: r.initiative.name,
    clientId: r.initiative.clientId,
    clientName: r.clientName,
    tier3FteRequired: Number(r.initiative.tier3FteRequired),
    startDate: r.initiative.startDate,
    endDate: r.initiative.endDate,
    status: r.initiative.status,
    notes: r.initiative.notes,
  }));

  return { clients: clientRows, staff, initiatives };
}
