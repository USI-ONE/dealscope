/**
 * Remediation — the crew's workspace for a walk.
 *
 * Tasks come from the assessment findings, flagged equipment and planned
 * drops (see lib/discovery/remediation.ts). Completing a finding task
 * resolves it in the client assessment, so the grade moves as work lands.
 */
import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import type { ServerPhoto } from "@/components/discovery/project-context";
import { requireRole } from "@/lib/auth-helpers";
import { NOT_ASSESSED_STYLE, GRADE_STYLE } from "@/lib/discovery/assessment";
import { loadSiteAssessment } from "@/lib/discovery/assessment-store";
import { getProject } from "@/lib/discovery/load";
import { photoUrl } from "@/lib/discovery/paths";
import { AREA_TITLE, plannedTasks } from "@/lib/discovery/remediation";
import { cn } from "@/lib/utils";
import { BuildPlanButton, TaskBoard, type BoardTask } from "@/components/discovery/remediation-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remediation" };

export default async function RemediationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const { assessment: a, data, tasks } = await loadSiteAssessment(project);

  const have = new Set(tasks.map((t) => t.sourceRef));
  const newlyPlanned = plannedTasks(a, data).filter((p) => !have.has(p.sourceRef)).length;

  const memberIds = [...new Set(tasks.map((t) => t.completedByMembershipId).filter(Boolean))] as string[];
  const names = memberIds.length
    ? await db
        .select({ id: memberships.id, name: users.name, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(inArray(memberships.id, memberIds))
    : [];
  const nameOf = new Map(names.map((n) => [n.id, n.name || n.email]));

  const photosByTask = new Map<string, ServerPhoto[]>();
  for (const p of data.photoRows) {
    if (!p.questionKey?.startsWith("task.")) continue;
    const list = photosByTask.get(p.questionKey.slice(5)) ?? [];
    list.push({
      id: p.id,
      url: photoUrl(project.id, p.id),
      caption: p.caption,
      takenAt: p.takenAt?.toISOString() ?? null,
      questionKey: p.questionKey,
      recordId: p.recordId,
      sectionKey: p.sectionKey,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
    });
    photosByTask.set(p.questionKey.slice(5), list);
  }

  const board: BoardTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    detail: t.detail,
    area: t.area,
    areaTitle: (t.area && AREA_TITLE[t.area]) || "Other",
    priority: t.priority,
    status: t.status,
    source: t.source,
    notes: t.notes,
    completedAt: t.completedAt?.toISOString() ?? null,
    completedBy: t.completedByMembershipId ? (nameOf.get(t.completedByMembershipId) ?? null) : null,
    photos: photosByTask.get(t.id) ?? [],
  }));

  const closed = tasks.filter((t) => t.status === "done" || t.status === "skipped").length;
  const pct = tasks.length ? Math.round((closed / tasks.length) * 100) : 0;

  return (
    <div className="space-y-5 pb-12">
      {/* Summary */}
      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="space-y-2">
          <p className="text-[15px] font-semibold">
            {tasks.length ? `${closed} of ${tasks.length} tasks closed` : "No remediation plan yet"}
          </p>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {tasks.length
              ? `${a.resolvedCount} of ${a.findingCount} assessment findings resolved. Closing a finding task re-grades the client assessment.`
              : `Build the plan to turn ${a.findingCount} findings, flagged equipment and planned drops into a task list.`}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:justify-end">
          <GradeChip label="As walked" grade={a.assessed ? a.baseGrade : null} score={a.baseScore} />
          <ArrowRight className="size-5 text-muted-foreground" />
          <GradeChip label="Now" grade={a.assessed ? a.grade : null} score={a.score} />
        </div>
      </section>

      {(newlyPlanned > 0 || !tasks.length) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4">
          <p className="text-sm">
            {tasks.length
              ? `${newlyPlanned} new item${newlyPlanned === 1 ? "" : "s"} from the walk aren’t on the plan yet.`
              : "Build the remediation plan from this walk’s findings."}
          </p>
          <BuildPlanButton projectId={project.id} label={tasks.length ? "Add to plan" : "Build plan"} />
        </div>
      )}

      {tasks.length > 0 && <TaskBoard projectId={project.id} tasks={board} />}
    </div>
  );
}

function GradeChip({ label, grade, score }: { label: string; grade: keyof typeof GRADE_STYLE | null; score: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn("flex size-12 items-center justify-center rounded-xl text-2xl font-black", grade ? GRADE_STYLE[grade] : NOT_ASSESSED_STYLE)}>
        {grade ?? "—"}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {grade ? ` · ${score}` : ""}
      </span>
    </div>
  );
}
