import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  MapPin,
  Network,
  Pencil,
  Play,
} from "lucide-react";
import { db } from "@/db";
import { clients, diligenceEngagements, discoveryTopologies } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { getProject, loadProjectData } from "@/lib/discovery/load";
import { answerToText, recordTitle, sectionFields, templateIndex } from "@/lib/discovery/templates";
import { DiscoveryStatusPill, ProgressRing } from "@/components/discovery/status-pill";
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

  const [data, client, engagement, [{ topologyCount }]] = await Promise.all([
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
  ]);
  const { template, progress, answers, recordRows, photoRows } = data;
  const idx = templateIndex(template);

  const nextOpen = template.sections.find((s) => {
    const p = progress.sections.get(s.key);
    return p && p.done < p.total;
  });

  const risks = recordRows.filter((r) => r.tableKey === "risks");
  const riskCounts = ["Blocker", "High", "Medium", "Low"].map((lvl) => ({
    lvl,
    n: risks.filter((r) => r.data.level === lvl).length,
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
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <Link href="/discovery" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
        <ChevronLeft className="size-4" /> All walks
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <DiscoveryStatusPill status={project.status} />
          {project.scheduledDate && <span className="text-xs text-muted-foreground">Walk date {project.scheduledDate}</span>}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
        </div>
      </header>

      {/* Progress */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <ProgressRing pct={progress.pct} size={64} stroke={6} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[15px] font-semibold">
            {progress.done} of {progress.total} items captured
          </p>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Required photos</span>
              <span>
                {progress.requiredPhotosDone}/{progress.requiredPhotos}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${progress.requiredPhotos ? (progress.requiredPhotosDone / progress.requiredPhotos) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Primary actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link
          href={`/discovery/${project.id}/s/${nextOpen?.key ?? template.sections[0].key}`}
          className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-[15px] font-semibold text-primary-foreground active:scale-[0.98] sm:col-span-1"
        >
          <Play className="size-5" /> {progress.done === 0 ? "Start" : nextOpen ? "Continue" : "Review"}
        </Link>
        <Link
          href={`/discovery/${project.id}/photos`}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[15px] font-medium active:scale-[0.98]"
        >
          <Camera className="size-5" /> Photos <span className="text-muted-foreground">{photoRows.length}</span>
        </Link>
        <Link
          href={`/discovery/${project.id}/report`}
          className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[15px] font-medium active:scale-[0.98]"
        >
          <FileText className="size-5" /> Report
        </Link>
        <a
          href={`/discovery/${project.id}/export.xlsx`}
          className="col-span-2 flex h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[15px] font-medium active:scale-[0.98] sm:col-span-1"
        >
          <FileSpreadsheet className="size-5" /> Excel
        </a>
      </div>

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
          href={`/discovery/${project.id}/s/risks`}
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
