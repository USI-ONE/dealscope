import { notFound } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { discoveryAnswers, discoveryInfoRequests, discoveryTasks } from "@/db/schema";
import { canCtx, requireRole } from "@/lib/auth-helpers";
import { getProject } from "@/lib/discovery/load";
import { photoPathPrefix } from "@/lib/discovery/paths";
import { DiscoveryProjectProvider } from "@/components/discovery/project-context";
import { DiscoveryStatusPill } from "@/components/discovery/status-pill";
import { WalkNav } from "@/components/discovery/walk-nav";

export default async function DiscoveryProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole("member");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();

  // Light queries only — every walk page renders through here.
  const [names, [counts]] = await Promise.all([
    db
      .select({ key: discoveryAnswers.questionKey, value: discoveryAnswers.value })
      .from(discoveryAnswers)
      .where(and(eq(discoveryAnswers.projectId, project.id), inArray(discoveryAnswers.questionKey, ["cover.client_name", "cover.site_name"]))),
    db
      .select({
        followUps: sql<number>`(select count(*)::int from ${discoveryAnswers}
          where ${discoveryAnswers.projectId} = ${project.id} and not ${discoveryAnswers.notApplicable}
          and (${discoveryAnswers.value}->>'followUp')::boolean is true)`,
        tasksOpen: sql<number>`(select count(*)::int from ${discoveryTasks}
          where ${discoveryTasks.projectId} = ${project.id} and ${discoveryTasks.status} in ('open','in_progress'))`,
        requestsAnswered: sql<number>`(select count(*)::int from ${discoveryInfoRequests}
          where ${discoveryInfoRequests.projectId} = ${project.id} and ${discoveryInfoRequests.status} = 'submitted')`,
      })
      .from(sql`(select 1) as one`),
  ]);
  const text = (k: string) => {
    const v = names.find((n) => n.key === k)?.value?.v;
    return typeof v === "string" ? v.trim() : "";
  };
  const client = text("cover.client_name");
  const site = text("cover.site_name") || project.name;
  const title = client && client.toLowerCase() !== site.toLowerCase() ? client : site;
  const subtitle = title === site ? "" : site;

  return (
    <DiscoveryProjectProvider
      value={{
        projectId: project.id,
        projectName: project.name,
        pathPrefix: photoPathPrefix(ctx.organization.id, project.id),
        canEdit: canCtx("update", "project", ctx) && !project.archivedAt,
      }}
    >
      <div className="mx-auto max-w-4xl print:max-w-none">
        <WalkNav
          projectId={project.id}
          title={title}
          subtitle={subtitle}
          status={<DiscoveryStatusPill status={project.status} />}
          counts={{ followUps: counts?.followUps ?? 0, tasksOpen: counts?.tasksOpen ?? 0, requestsAnswered: counts?.requestsAnswered ?? 0 }}
        />
        {children}
      </div>
    </DiscoveryProjectProvider>
  );
}
