/**
 * Client site assessment — what the business owner reads.
 *
 * Grades and findings come from the walk data on every load; the plain-
 * English summary, business impact and phased roadmap are written by
 * Claude on request and cached (refresh when the walk changes).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth-helpers";
import { getProject, walkSiteName } from "@/lib/discovery/load";
import { loadSiteAssessment } from "@/lib/discovery/assessment-store";
import { COST_LEGEND, COSTS, enforceCost, gradeBadge, PHASES, type Cost, type Phase } from "@/lib/discovery/assessment";
import { recordTitle, templateIndex } from "@/lib/discovery/templates";
import { photoUrl } from "@/lib/discovery/paths";
import { photoSrc } from "@/lib/discovery/photo-variants";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { PrintButton } from "@/components/discovery/print-button";
import { GenerateNarrativeButton } from "@/components/discovery/assessment-controls";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
// The "Write summary" server action runs in this page's function; Claude takes ~30-60s.
export const maxDuration = 300;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const site = await walkSiteName(id, ctx.organization.id);
  return { title: { absolute: site ? `Site Assessment - ${site}` : "Site Assessment" } };
}

const EVIDENCE = [
  "photos.exterior",
  "photos.mdf_front",
  "photos.mdf_back",
  "photos.mdf_floor",
  "photos.fw_front",
  "photos.hazard",
  "photos.ceiling_tile",
  "photos.ext_cameras",
  "photos.damage",
];
const PHASE_BLURB: Record<Phase, string> = {
  "Fix now": "Safety, security or outage risks that shouldn’t wait",
  "Next 90 days": "Important improvements to plan and budget",
  "Planned refresh": "Modernization to follow the first two",
};
const LEVEL_PHASE: Record<string, Phase> = { Blocker: "Fix now", High: "Fix now", Medium: "Next 90 days", Low: "Planned refresh" };

export default async function SiteAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const { data, assessment: a, narrative, tasks } = await loadSiteAssessment(project);
  const n = narrative?.content;
  const impacts = new Map(n?.area_impacts.map((i) => [i.area, i.impact]));
  const areaTitle = new Map(a.areas.map((x) => [x.key as string, x.title]));

  // AI roadmap when written; otherwise fall back to the logged risks.
  const roadmap: Array<{ title: string; why: string; area: string; phase: Phase; cost: Cost | null }> = n
    ? n.roadmap.map((r) => enforceCost({ ...r, area: areaTitle.get(r.area) ?? r.area }))
    : a.risks.map((r) => ({ title: r.risk, why: "", area: r.area, phase: LEVEL_PHASE[r.level] ?? "Next 90 days", cost: null }));

  // Photos the walker ticked on the Photos tab (one per file); if none are
  // picked yet, fall back to a few of the required shots.
  const idx = templateIndex(data.template);
  const recordById = new Map(data.recordRows.map((r) => [r.id, r]));
  const labelOf = (p: (typeof data.photoRows)[number]) => {
    if (p.caption) return p.caption;
    if (p.questionKey) return idx.fields.get(p.questionKey)?.label ?? "";
    const r = p.recordId ? recordById.get(p.recordId) : undefined;
    const t = r ? idx.tables.get(r.tableKey) : undefined;
    return r && t ? recordTitle(t.table, r.data) : "";
  };
  const seen = new Set<string>();
  const picked = data.photoRows
    .filter((p) => p.inReport && !seen.has(p.url) && seen.add(p.url))
    .sort((x, y) => (x.takenAt?.getTime() ?? 0) - (y.takenAt?.getTime() ?? 0));
  const evidence = (
    picked.length
      ? picked
      : EVIDENCE.flatMap((k) => {
          const p = data.photoRows.find((x) => x.questionKey === k);
          return p ? [p] : [];
        }).slice(0, 6)
  ).map((p) => ({ id: p.id, label: labelOf(p) }));

  const aiReady = isAiConfigured();
  const completed = tasks
    .filter((t) => t.status === "done")
    .sort((x, y) => (y.completedAt?.getTime() ?? 0) - (x.completedAt?.getTime() ?? 0));
  const afterPhoto = new Map<string, string>();
  for (const p of data.photoRows)
    if (p.questionKey?.startsWith("task.") && !afterPhoto.has(p.questionKey.slice(5))) afterPhoto.set(p.questionKey.slice(5), p.id);

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16 print:max-w-none print:space-y-6 print:text-[11px]">
      <div className="flex flex-wrap items-center justify-end gap-2 print:hidden">
        <div className="flex flex-wrap gap-2">
          {aiReady && (
            <GenerateNarrativeButton
              projectId={project.id}
              label={!n ? "Write summary" : narrative?.stale ? "Refresh summary (walk changed)" : "Rewrite summary"}
              variant={!n || narrative?.stale ? "primary" : "subtle"}
            />
          )}
          <PrintButton />
        </div>
      </div>

      {/* Cover */}
      <header className="flex flex-col gap-5 border-b-4 border-foreground pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">IT site assessment</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{a.customer || a.site}</h1>
          {a.customer && <p className="text-xl font-semibold text-primary">{a.site}</p>}
          {a.address && <p className="text-[15px]">{a.address}</p>}
          {a.walked && <p className="text-sm text-muted-foreground">Site walk {a.walked}</p>}
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("flex size-20 items-center justify-center rounded-2xl text-5xl font-black", gradeBadge(a).className)}>
            {gradeBadge(a).text}
          </span>
          <span className="text-sm leading-tight text-muted-foreground">
            Overall
            <br />
            {a.assessed ? (
              <>
                <span className="text-2xl font-bold text-foreground tabular-nums">{a.score}</span>/100
              </>
            ) : (
              <span className="font-semibold text-foreground">Not enough data</span>
            )}
            {a.partial && (
              <>
                <br />
                <span className="text-xs">
                  {a.assessedCount} of {a.areaCount} areas assessed
                </span>
              </>
            )}
            {a.assessed && a.resolvedCount > 0 && (
              <>
                <br />
                <span className="text-xs">
                  was {a.baseGrade} ({a.baseScore}) as walked
                </span>
              </>
            )}
          </span>
        </div>
      </header>

      {a.partial && (
        <section className="space-y-1.5 rounded-xl border border-dashed border-amber-500/60 bg-amber-500/5 p-4 text-sm">
          <p className="font-semibold">
            {a.assessed
              ? `Partial assessment — the overall grade covers ${a.assessedCount} of ${a.areaCount} areas.`
              : `Not enough walk data for an overall grade — only ${a.assessedCount} of ${a.areaCount} areas could be assessed.`}
          </p>
          <p className="text-muted-foreground">Still to capture on the walk:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {a.areas
              .filter((x) => !x.assessed)
              .map((x) => (
                <li key={x.key}>
                  <span className="font-medium">{x.title}:</span> {x.missing.join(", ")}
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Executive summary */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Executive summary</h2>
        {n ? (
          <>
            <p className="text-lg font-semibold leading-snug">{n.headline}</p>
            {n.summary.split(/\n\s*\n/).map((p, i) => (
              <p key={i} className="text-[15px] leading-relaxed">
                {p}
              </p>
            ))}
            {narrative?.stale && (
              <p className="text-xs text-amber-600 print:hidden">The walk has changed since this summary was written — refresh it.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {aiReady
              ? "Use “Write summary” above to add a plain-English summary, business impact and a phased roadmap with cost bands."
              : "AI isn’t configured, so the summary can’t be written. The scorecard and roadmap below come straight from the walk."}
          </p>
        )}
      </section>

      {/* Scorecard */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Scorecard</h2>
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          {a.areas.map((x) => (
            <div key={x.key} className="break-inside-avoid rounded-xl border border-border p-4">
              <div className="flex items-start gap-3">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg text-2xl font-black", gradeBadge(x).className)}>
                  {gradeBadge(x).text}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{x.title}</p>
                  <p className="text-xs text-muted-foreground">{x.blurb}</p>
                </div>
              </div>
              {impacts.get(x.key) && <p className="mt-2.5 text-sm font-medium">{impacts.get(x.key)}</p>}
              {x.missing.length > 0 && (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                  {x.assessed ? "Partly checked (capped below A) — still to check" : "Not assessed — still to check"}: {x.missing.join(", ")}.
                </p>
              )}
              {x.findings.length ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {x.findings.map((f) =>
                    f.resolved ? (
                      <li key={f.id} className="marker:text-emerald-600">
                        <span className="line-through decoration-1">{f.text}</span>{" "}
                        <span className="font-semibold text-emerald-700 no-underline dark:text-emerald-400">✓ Resolved</span>
                      </li>
                    ) : (
                      <li key={f.id}>{f.text}</li>
                    ),
                  )}
                </ul>
              ) : x.assessed ? (
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">No issues found on the walk.</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Roadmap */}
      {roadmap.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-bold">Recommended roadmap</h2>
            {n && (
              <p className="text-xs text-muted-foreground">
                {COSTS.map((c) => `${c} ${roadmap.filter((r) => r.cost === c).length}`).join(" · ")} items
              </p>
            )}
          </div>
          {PHASES.map((ph) => {
            const items = roadmap.filter((r) => r.phase === ph);
            if (!items.length) return null;
            return (
              <div key={ph} className="space-y-1.5">
                <h3 className="flex items-baseline gap-2">
                  <span className="text-[15px] font-bold">{ph}</span>
                  <span className="text-xs text-muted-foreground">{PHASE_BLURB[ph]}</span>
                </h3>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {items.map((r, i) => (
                      <tr key={i} className="break-inside-avoid border-b border-border/60 align-top">
                        <td className="py-2 pr-3">
                          <span className="font-medium">{r.title}</span>
                          {r.why && <span className="block text-muted-foreground">{r.why}</span>}
                        </td>
                        <td className="w-32 py-2 pr-3 text-xs text-muted-foreground">{r.area}</td>
                        <td className="w-12 py-2 text-right font-bold tabular-nums">{r.cost ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {n && (
            <dl className="grid gap-1 rounded-lg bg-muted/50 p-3 text-xs sm:grid-cols-3 print:bg-transparent">
              {COSTS.map((c) => (
                <div key={c}>
                  <dt className="inline font-bold">{c}</dt> <dd className="inline text-muted-foreground">{COST_LEGEND[c]}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      {n && n.strengths.length > 0 && (
        <section className="space-y-2 break-inside-avoid">
          <h2 className="text-xl font-bold">What’s working</h2>
          <ul className="list-disc space-y-1 pl-5 text-[15px]">
            {n.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-bold">Progress since the walk</h2>
            <p className="text-sm text-muted-foreground">
              {completed.length} of {tasks.length} remediation items complete
            </p>
          </div>
          <ul className="divide-y divide-border/70">
            {completed.map((t) => (
              <li key={t.id} className="flex break-inside-avoid items-start gap-3 py-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.title}</p>
                  {t.detail && <p className="text-sm text-muted-foreground">{t.detail}</p>}
                  {t.completedAt && (
                    <p className="text-xs text-muted-foreground">
                      Completed {t.completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
                {afterPhoto.get(t.id) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoSrc(photoUrl(project.id, afterPhoto.get(t.id)!), "thumb")}
                    alt="After"
                    className="h-16 w-20 shrink-0 rounded-md border border-border object-cover"
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {evidence.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-bold">From the site walk</h2>
            <Link href={`/discovery/${project.id}/photos?tab=all`} className="text-sm font-medium text-primary hover:underline print:hidden">
              {picked.length ? `Change photos (${picked.length} selected)` : "Choose photos for this report"}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {evidence.map((p) => (
              <figure key={p.id} className="break-inside-avoid space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc(photoUrl(project.id, p.id), "md")}
                  alt={p.label}
                  className="aspect-[4/3] w-full rounded-lg border border-border object-cover"
                />
                {p.label && <figcaption className="text-xs text-muted-foreground">{p.label}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        Grades reflect what was observed on the site walk{a.followUps ? `; ${a.followUps} items are still being confirmed` : ""}. Cost bands
        are relative and exclude pricing. Prepared {new Date().toLocaleDateString("en-US", { timeZone: "America/Denver" })}.
      </p>
    </div>
  );
}
