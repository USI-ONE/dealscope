/**
 * Per-client project report data assembly.
 *
 * Pulls everything that goes into a client-facing status report for ONE
 * project, filtered strictly to client-visible content. Returns a
 * structured object the format-specific renderers (DOCX, HTML/PDF)
 * each consume.
 *
 * Tenancy enforcement
 * ───────────────────
 * Every query is scoped to (organizationId, projectId) AND the project's
 * client_id is read fresh from the DB — we don't trust any caller-passed
 * client identifier. Client-visible filtering happens here so each
 * renderer can stay format-only.
 *
 * What ships in the report
 * ────────────────────────
 *   Cover info: project name + code, client name, status, health,
 *     planned dates, PM name, lead engineer name, contract type
 *
 *   Executive summary: project.summary
 *
 *   Scope: project.scopeMd (if present)
 *
 *   Progress: rollup of milestones + their target dates, status, and
 *     % task completion per milestone. Internal-only milestones
 *     excluded.
 *
 *   Recent status updates: most recent N client-visible status updates,
 *     newest first, with health snapshots.
 *
 *   Deliverables: client-visible documents grouped by kind.
 *
 * Anything flagged client_visible=false on milestones / status updates /
 * documents is excluded; tasks are NEVER included individually in the
 * report (their rollup contributes only to % complete).
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  clients,
  memberships,
  projects,
  projectDocuments,
  projectMilestones,
  projectStatusUpdates,
  projectTasks,
  users,
} from "@/db/schema";

export type ClientReportData = {
  /** Project identity. */
  project: {
    id: string;
    code: string;
    name: string;
    kind: string;
    status: string;
    health: string;
    priority: string;
    summary: string | null;
    scopeMd: string | null;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    actualStartDate: string | null;
    actualEndDate: string | null;
    contractTypeLabel: string | null;
    totalEstimatedHours: number | null;
    totalActualHours: number | null;
    pmName: string | null;
    leadEngineerName: string | null;
  };
  client: {
    id: string;
    name: string;
    slug: string | null;
  };
  /** Org-wide identity for the report header. */
  organization: {
    id: string;
    name: string;
  };
  milestones: Array<{
    id: string;
    name: string;
    description: string | null;
    targetDate: string | null;
    status: string;
    totalTasks: number;
    doneTasks: number;
    percentComplete: number;
  }>;
  statusUpdates: Array<{
    id: string;
    kind: string;
    body: string;
    healthAtPost: string;
    postedAt: string;
    authorName: string | null;
  }>;
  documents: Array<{
    id: string;
    kind: string;
    title: string;
    bodyMd: string | null;
    fileUrl: string | null;
  }>;
  /** Overall rollup. */
  rollup: {
    totalTasks: number;
    doneTasks: number;
    percentComplete: number;
    milestoneCount: number;
    completedMilestones: number;
  };
  /** UTC ISO timestamp the report was generated at — included in the
   *  footer so the client knows the cutoff. */
  generatedAt: string;
};

export async function buildClientReport({
  organizationId,
  projectId,
  generatedAt,
}: {
  organizationId: string;
  projectId: string;
  /** ISO timestamp the caller stamps in. Passed in (not generated here)
   *  to keep the data assembly deterministic for testing. */
  generatedAt: string;
}): Promise<ClientReportData | null> {
  const proj = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, projectId),
      eq(projects.organizationId, organizationId),
    ),
  });
  if (!proj) return null;

  const [client, organizationRow, pmRow, leadRow, msRows, taskRows, statusRows, docRows] =
    await Promise.all([
      db.query.clients.findFirst({
        where: eq(clients.id, proj.clientId),
        columns: { id: true, name: true, slug: true },
      }),
      db.query.organizations
        ? db.query.organizations.findFirst({
            where: (org, { eq }) => eq(org.id, organizationId),
            columns: { id: true, name: true },
          })
        : Promise.resolve(null),
      proj.primaryPmMembershipId
        ? db
            .select({ name: users.name, email: users.email })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(eq(memberships.id, proj.primaryPmMembershipId))
            .limit(1)
        : Promise.resolve(
            [] as Array<{ name: string | null; email: string }>,
          ),
      proj.leadEngineerMembershipId
        ? db
            .select({ name: users.name, email: users.email })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(eq(memberships.id, proj.leadEngineerMembershipId))
            .limit(1)
        : Promise.resolve(
            [] as Array<{ name: string | null; email: string }>,
          ),
      db
        .select()
        .from(projectMilestones)
        .where(
          and(
            eq(projectMilestones.projectId, proj.id),
            eq(projectMilestones.clientVisible, true),
          ),
        )
        .orderBy(asc(projectMilestones.position)),
      db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.projectId, proj.id)),
      db
        .select({
          update: projectStatusUpdates,
          authorName: users.name,
          authorEmail: users.email,
        })
        .from(projectStatusUpdates)
        .leftJoin(
          memberships,
          eq(memberships.id, projectStatusUpdates.authorMembershipId),
        )
        .leftJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(projectStatusUpdates.projectId, proj.id),
            eq(projectStatusUpdates.clientVisible, true),
          ),
        )
        .orderBy(desc(projectStatusUpdates.postedAt))
        .limit(20),
      db
        .select()
        .from(projectDocuments)
        .where(
          and(
            eq(projectDocuments.projectId, proj.id),
            eq(projectDocuments.clientVisible, true),
          ),
        )
        .orderBy(desc(projectDocuments.createdAt)),
    ]);

  if (!client) return null;

  // Roll up task completion per milestone. Tasks count toward their
  // milestone regardless of milestone client_visible — but only
  // client-visible milestones appear in the report, so the rollup
  // accurately reflects client-visible progress.
  const tasksByMs = new Map<string | null, number>();
  const doneByMs = new Map<string | null, number>();
  for (const t of taskRows) {
    const key = t.milestoneId ?? null;
    tasksByMs.set(key, (tasksByMs.get(key) ?? 0) + 1);
    if (t.status === "done") {
      doneByMs.set(key, (doneByMs.get(key) ?? 0) + 1);
    }
  }

  const milestones = msRows.map((m) => {
    const total = tasksByMs.get(m.id) ?? 0;
    const done = doneByMs.get(m.id) ?? 0;
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      targetDate: m.targetDate,
      status: m.status,
      totalTasks: total,
      doneTasks: done,
      percentComplete: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  });

  // Project-wide rollup uses ALL tasks regardless of milestone
  // visibility — the % is about overall delivery progress.
  const totalTasks = taskRows.length;
  const doneTasks = taskRows.filter((t) => t.status === "done").length;

  return {
    project: {
      id: proj.id,
      code: proj.code,
      name: proj.name,
      kind: proj.kind,
      status: proj.status,
      health: proj.health,
      priority: proj.priority,
      summary: proj.summary,
      scopeMd: proj.scopeMd,
      plannedStartDate: proj.plannedStartDate,
      plannedEndDate: proj.plannedEndDate,
      actualStartDate: proj.actualStartDate,
      actualEndDate: proj.actualEndDate,
      contractTypeLabel: proj.contractTypeLabel,
      totalEstimatedHours: proj.totalEstimatedHours,
      totalActualHours: proj.totalActualHours,
      pmName: pmRow[0]?.name ?? pmRow[0]?.email ?? null,
      leadEngineerName: leadRow[0]?.name ?? leadRow[0]?.email ?? null,
    },
    client: {
      id: client.id,
      name: client.name,
      slug: client.slug,
    },
    organization: {
      id: organizationId,
      name: organizationRow?.name ?? "TechOS",
    },
    milestones,
    statusUpdates: statusRows.map((s) => ({
      id: s.update.id,
      kind: s.update.kind,
      body: s.update.body,
      healthAtPost: s.update.healthAtPost,
      postedAt:
        typeof s.update.postedAt === "string"
          ? s.update.postedAt
          : s.update.postedAt.toISOString(),
      authorName: s.authorName ?? s.authorEmail ?? null,
    })),
    documents: docRows.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      bodyMd: d.bodyMd,
      fileUrl: d.fileUrl,
    })),
    rollup: {
      totalTasks,
      doneTasks,
      percentComplete:
        totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
      milestoneCount: milestones.length,
      completedMilestones: milestones.filter(
        (m) => m.status === "completed",
      ).length,
    },
    generatedAt,
  };
}
