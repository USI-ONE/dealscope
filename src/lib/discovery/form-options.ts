import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, diligenceEngagements } from "@/db/schema";
import { getOrgMembers } from "@/lib/auth-helpers";

export async function loadProjectFormOptions(organizationId: string) {
  const [clientRows, engagementRows, members] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.organizationId, organizationId), isNull(clients.archivedAt)))
      .orderBy(asc(clients.name)),
    db
      .select({ id: diligenceEngagements.id, name: diligenceEngagements.targetCompanyName, codename: diligenceEngagements.codename })
      .from(diligenceEngagements)
      .where(and(eq(diligenceEngagements.organizationId, organizationId), isNull(diligenceEngagements.archivedAt)))
      .orderBy(asc(diligenceEngagements.targetCompanyName)),
    getOrgMembers(organizationId),
  ]);
  return {
    clients: clientRows.map((c) => ({ id: c.id, label: c.name })),
    engagements: engagementRows.map((e) => ({ id: e.id, label: e.codename ? `${e.name} (${e.codename})` : e.name })),
    members: members.map((m) => ({ id: m.id, label: m.fullName ?? m.email })),
  };
}
