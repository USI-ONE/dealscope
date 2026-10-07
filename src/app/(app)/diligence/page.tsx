import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  diligenceEngagements,
  diligenceFindings,
  diligenceSessions,
  memberships,
  users,
} from "@/db/schema";
import { getOrgMembers, requireContext } from "@/lib/auth-helpers";
import { can } from "@/lib/rbac";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateEngagementDialog } from "@/components/diligence/create-engagement-dialog";
import {
  EngagementList,
  type EngagementRow,
} from "@/components/diligence/engagement-list";

export const metadata = { title: "DealScope · Diligence" };

export default async function TechOsDiligencePage() {
  const ctx = await requireContext();

  // Each CTE aliases its aggregate to a distinct name so the outer SELECT
  // never ends up with two columns called `count` (Postgres throws
  // "column reference \"count\" is ambiguous" when Drizzle compiles the
  // joined projection).
  const sessionCounts = db.$with("sc").as(
    db
      .select({
        engagementId: diligenceSessions.engagementId,
        sessionCount: sql<number>`count(*)::int`.as("session_count"),
      })
      .from(diligenceSessions)
      .groupBy(diligenceSessions.engagementId),
  );
  const findingCounts = db.$with("fc").as(
    db
      .select({
        engagementId: diligenceFindings.engagementId,
        findingCount: sql<number>`count(*)::int`.as("finding_count"),
      })
      .from(diligenceFindings)
      .groupBy(diligenceFindings.engagementId),
  );

  const rows = await db
    .with(sessionCounts, findingCounts)
    .select({
      engagement: diligenceEngagements,
      leadName: users.name,
      leadEmail: users.email,
      sessionCount: sessionCounts.sessionCount,
      findingCount: findingCounts.findingCount,
      clientName: clients.name,
    })
    .from(diligenceEngagements)
    .leftJoin(
      memberships,
      eq(diligenceEngagements.leadInterviewerMembershipId, memberships.id),
    )
    .leftJoin(users, eq(memberships.userId, users.id))
    .leftJoin(
      sessionCounts,
      eq(sessionCounts.engagementId, diligenceEngagements.id),
    )
    .leftJoin(
      findingCounts,
      eq(findingCounts.engagementId, diligenceEngagements.id),
    )
    .leftJoin(clients, eq(clients.id, diligenceEngagements.clientId))
    .where(eq(diligenceEngagements.organizationId, ctx.organization.id))
    .orderBy(diligenceEngagements.targetCompanyName);

  const data: EngagementRow[] = rows.map((r) => ({
    id: r.engagement.id,
    targetCompanyName: r.engagement.targetCompanyName,
    codename: r.engagement.codename,
    status: r.engagement.status,
    leadInterviewerName: r.leadName ?? r.leadEmail ?? null,
    partners: r.engagement.partners,
    kickoffDate: r.engagement.kickoffDate,
    deliveryDate: r.engagement.deliveryDate,
    archivedAt: r.engagement.archivedAt,
    sessionCount: r.sessionCount ?? 0,
    findingCount: r.findingCount ?? 0,
    clientId: r.engagement.clientId ?? null,
    clientName: r.clientName ?? null,
  }));

  const canCreate = can("create", "diligence", { role: ctx.membership.role });
  const allMembers = await getOrgMembers(ctx.organization.id);
  const allClients = await db.query.clients.findMany({
    where: eq(clients.organizationId, ctx.organization.id),
    columns: { id: true, name: true },
    orderBy: (c, { asc }) => [asc(c.name)],
  });

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6 pb-2">
        <div>
          <p className="mb-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-primary">
            M&amp;A Due Diligence
          </p>
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
            Engagements
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-muted-foreground">
            Pre-acquisition diligence from first interview to executive briefing.
          </p>
        </div>
        {canCreate && (
          <div className="shrink-0">
            <CreateEngagementDialog
              members={allMembers}
              clients={allClients}
              currentMemberId={ctx.membership.id}
            />
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <Card className="py-16 text-center">
          <CardHeader>
            <CardTitle className="text-2xl">No engagements yet</CardTitle>
            <CardDescription className="mt-2 text-base">
              Start a new engagement to begin capturing interview notes, applications,
              infrastructure, identities, vendors, AI usage, contracts, and findings.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : (
        <EngagementList rows={data} />
      )}
    </div>
  );
}
