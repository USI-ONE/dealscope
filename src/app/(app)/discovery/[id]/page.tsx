import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import {
  AlertTriangle,
  Camera,
  ChartColumn,
  Check,
  ChevronRight,
  CircleHelp,
  HardHat,
  ListChecks,
  MapPin,
  Network,
  Pencil,
  Play,
  Send,
} from "lucide-react";
import { db } from "@/db";
import { clients, diligenceEngagements, discoveryInfoRequests, discoveryTopologies } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { getProject, loadProjectData } from "@/lib/discovery/load";
import { assessSite, gradeBadge } from "@/lib/discovery/assessment";
import { loadTasks, resolvedFindings } from "@/lib/discovery/remediation";
import { answerToText, recordTitle, sectionFields, templateIndex } from "@/lib/discovery/templates";
import { ProgressRing } from "@/components/discovery/status-pill";
import { SectionIcon } from "@/components/discovery/section-icon";
import { ProjectSearch, type SearchEntry } from "@/components/discovery/project-search";
import { StatusActions } from "@/components/discovery/status-actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site walk" };

export default async function DiscoveryHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();

  const [data, client, engagement, [{ topologyCount }], tasks, requestRows] = await Promise.all([
    loadProjectData(project),
    project.clientId
      ? db.query.clients.findFirst({ where: eq(clients.id, project.clientId), columns: { id: true, name: true } })
      : null,
    project.engagementId
      ? db.query.diligenceEngagements.findFirst({
          where: eq(diligenceEngagements.id, project.engagementId),
          columns: { id: true, targetCompanyName: true },
        })
      : null,
    db
      .select({ topologyCount: sql<number>`count(*)::int` })
      .from(discoveryTopologies)
      .where(eq(discoveryTopologies.projectId, project.id)),
    loadTasks(project.id),
    db.select({ status: discoveryInfoRequests.status }).from(discoveryInfoRequests).where(eq(discoveryInfoRequests.projectId, project.id)),
  ]);
  const assessment = assessSite(project, data, resolvedFindings(tasks));
  const tasksDone = tasks.filter((t) => t.status === "done" || t.status === "skipped").length;
  const requests = { sent: requestRows.length, answered: requestRows.filter((r) => r.status === "submitted").length };
  const { template, progress, answers, recordRows, photoRows } = data;
  const idx = templateIndex(template);

  const nextOpen = template.sections.find((s) => {
    const p = progress.sections.get(s.key);
    return p && p.done < p.total;
  });

  const risks = assessment.risks;
  const riskCounts = ["Blocker", "High", "Medium", "Low"].map((lvl) => ({
    lvl,
    n: risks.filter((r) => r.level === lvl).length,
  }));

  // Everything captured, flattened for on-device search.
  const search: SearchEntry[] = [];
  for (const section of template.sections) {
    for (const f of sectionFields(section)) {
      const text = answerToText(f, answers.get(f.questionKey));
      const notes = answers.get(f.questionKey)?.notes;
      if (text || notes)
        search.push({
          title: f.label,
          detail: [text, notes].filter(Boolean).join(" — "),
          section: section.title,
          href: `/discovery/${project.id}/s/${section.key}?q=${encodeURIComponent(f.questionKey)}`,
        });
    }
  }
  for (const r of recordRows) {
    const t = idx.tables.get(r.tableKey);
    if (!t) continue;
    search.push({
      title: recordTitle(t.table, r.data),
      detail: Object.values(r.data).filter(Boolean).join(" · "),
      section: `${idx.sections.get(t.sectionKey)?.title} · ${t.table.singular}`,
      href: `/discovery/${project.id}/s/${t.sectionKey}`,
    });
  }
  for (const p of photoRows) {
    if (!p.caption) continue;
    search.push({ title: p.caption, detail: "Photo caption", section: "Photos", href: `/discovery/${project.id}/photos` });
  }

  const mapsHref = project.siteAddress ? `https://maps.google.com/?q=${encodeURIComponent(project.siteAddress)}` : null;

  return (
    <div className="space-y-5 pb-10">

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {project.scheduledDate && <span>Walked {project.scheduledDate}</span>}
        {client && <span>{client.name}</span>}
        {engagement && (
          <Link href={`/diligence/${engagement.id}`} className="underline-offset-2 hover:underline">
            Engagement: {engagement.targetCompanyName}
          </Link>
        )}
        {mapsHref && (
          <a href={mapsHref} target="_blank" rel="noreferrer" className="flex items-center gap-1 underline-offset-2 hover:underline">
            <MapPin className="size-3.5" /> {project.siteAddress}
          </a>
        )}
        <Link href={`/discovery/${project.id}/edit`} className="ml-auto flex items-center gap-1 underline-offset-2 hover:underline">
          <Pencil className="size-3.5" /> Edit details
        </Link>
      </div>

      {/* Workflow: walk -> confirm -> assess -> remediate */}
      <ol className="grid gap-3 sm:grid-cols-2">
        <Step n={1} title="Walk the site" done={!nextOpen}>
          <div className="flex items-center gap-3">
            <ProgressRing pct={progress.pct} size={52} stroke={5} />
            <p className="text-sm text-muted-foreground">
              {progress.done} of {progress.total} captured
              <br />
              {progress.requiredPhotosDone}/{progress.requiredPhotos} required photos
            </p>
          </div>
          <StepLink href={`/discovery/${project.id}/s/${nextOpen?.key ?? template.sections[0].key}`} primary={!!nextOpen}>
            <Play className="size-4" /> {progress.done === 0 ? "Start the walk" : nextOpen ? "Continue walk" : "Review answers"}
          </StepLink>
        </Step>
        <Step n={2} title="Confirm the details" done={progress.followUps === 0}>
          <p className="text-sm text-muted-foreground">
            {progress.followUps
              ? `${progress.followUps} question${progress.followUps === 1 ? "" : "s"} still open.`
              : "Nothing left to confirm."}{" "}
            {requests.sent
              ? `${requests.sent} request${requests.sent === 1 ? "" : "s"} sent${requests.answered ? `, ${requests.answered} answered` : ""}.`
              : ""}
          </p>
          {progress.followUps > 0 && (
            <div className="mt-auto flex flex-wrap gap-2">
              <StepLink href={`/discovery/${project.id}/requests`} primary={!requests.sent && !nextOpen}>
                <Send className="size-4" /> Ask the client
              </StepLink>
              <StepLink href={`/discovery/${project.id}/follow-ups`}>
                <CircleHelp className="size-4" /> View follow-ups
              </StepLink>
            </div>
          )}
        </Step>
        <Step n={3} title="Assess" done={false}>
          <div className="flex items-center gap-3">
            <span className={cn("flex size-11 items-center justify-center rounded-lg text-2xl font-black", gradeBadge(assessment).className)}>
              {gradeBadge(assessment).text}
            </span>
            <p className="text-sm text-muted-foreground">
              {!assessment.assessed
                ? `Not enough data yet — ${assessment.assessedCount} of ${assessment.areaCount} areas assessed`
                : assessment.partial
                  ? `${assessment.score}/100 · partial (${assessment.assessedCount} of ${assessment.areaCount} areas)`
                  : assessment.resolvedCount
                ? `Was ${assessment.baseGrade} (${assessment.baseScore}) as walked — now ${assessment.score}/100`
                : `${assessment.score}/100 · ${assessment.findingCount} findings`}
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <StepLink href={`/discovery/${project.id}/assessment`}>
              <ChartColumn className="size-4" /> Client assessment
            </StepLink>
            <StepLink href={`/discovery/${project.id}/install`}>
              <HardHat className="size-4" /> Install brief
            </StepLink>
          </div>
        </Step>
        <Step n={4} title="Remediate" done={tasks.length > 0 && tasksDone === tasks.length}>
          {tasks.length ? (
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                {tasksDone} of {tasks.length} tasks done
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(tasksDone / tasks.length) * 100}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Turn the findings into a task list the crew works on site.</p>
          )}
          <StepLink href={`/discovery/${project.id}/remediation`} primary={!nextOpen && tasksDone < tasks.length}>
            <ListChecks className="size-4" /> {tasks.length ? "Open remediation" : "Plan remediation"}
          </StepLink>
        </Step>
      </ol>

      <Link
        href={`/discovery/${project.id}/topology`}
        className="flex items-center gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4 shadow-sm active:scale-[0.99]"
      >
        <Network className="size-6 shrink-0 text-violet-600" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Network topology</span>
          <span className="block text-[13px] text-muted-foreground">
            {topologyCount
              ? `${topologyCount} diagram${topologyCount === 1 ? "" : "s"} documented`
              : "Snap a controller screenshot, whiteboard or marked-up floor plan"}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Link>

      <ProjectSearch entries={search} />

      {risks.length > 0 && (
        <Link
          href={`/discovery/${project.id}/assessment`}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
          <AlertTriangle className="size-5 shrink-0 text-amber-500" />
          <span className="flex-1 text-[15px] font-medium">{risks.length} risks & blockers</span>
          <span className="flex gap-1.5">
            {riskCounts
              .filter((r) => r.n)
              .map((r) => (
                <span
                  key={r.lvl}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    r.lvl === "Blocker" ? "bg-rose-600 text-white" : r.lvl === "High" ? "bg-rose-500/15 text-rose-700 dark:text-rose-300" : "bg-muted",
                  )}
                >
                  {r.n} {r.lvl}
                </span>
              ))}
          </span>
        </Link>
      )}

      {/* Sections */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Sections</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {template.sections.map((s) => {
            const p = progress.sections.get(s.key)!;
            const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
            const complete = p.done >= p.total;
            return (
              <li key={s.key}>
                <Link href={`/discovery/${project.id}/s/${s.key}`} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5 active:bg-accent">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl",
                      complete ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <SectionIcon name={s.icon} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium">{s.title}</span>
                      {p.na && <span className="rounded bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">N/A</span>}
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full rounded-full", complete ? "bg-emerald-500" : "bg-primary")}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                        {p.done}/{p.total}
                      </span>
                    </span>
                  </span>
                  {p.followUps > 0 && (
                    <span className="flex items-center gap-0.5 text-xs tabular-nums text-amber-600" title="Open follow-ups">
                      <CircleHelp className="size-3.5" />
                      {p.followUps}
                    </span>
                  )}
                  {p.requiredPhotos > 0 && !p.na && (
                    <span
                      className={cn(
                        "flex items-center gap-0.5 text-xs tabular-nums",
                        p.requiredPhotosDone >= p.requiredPhotos ? "text-emerald-600" : "text-amber-600",
                      )}
                    >
                      <Camera className="size-3.5" />
                      {p.requiredPhotosDone}/{p.requiredPhotos}
                    </span>
                  )}
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <StatusActions projectId={project.id} status={project.status} />
        <Link
          href={`/discovery/${project.id}/edit`}
          className="ml-auto flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-muted-foreground active:bg-accent"
        >
          <Pencil className="size-4" /> Edit details
        </Link>
      </div>
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            done ? "bg-emerald-600 text-white" : "bg-foreground text-background",
          )}
        >
          {done ? <Check className="size-4" /> : n}
        </span>
        <p className="text-[15px] font-semibold">{title}</p>
      </div>
      {children}
    </li>
  );
}

function StepLink({ href, primary, children }: { href: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "mt-auto inline-flex h-10 w-fit items-center gap-1.5 rounded-full px-4 text-sm font-semibold active:scale-[0.98]",
        primary ? "bg-primary text-primary-foreground" : "border border-border bg-background",
      )}
    >
      {children}
    </Link>
  );
}
