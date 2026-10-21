/**
 * Client site assessment — what the business owner reads.
 *
 * Grades and findings come from the walk data on every load; the plain-
 * English summary, business impact and phased roadmap are written by
 * Claude on request and cached (refresh when the walk changes).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { getProject } from "@/lib/discovery/load";
import { loadSiteAssessment } from "@/lib/discovery/assessment-store";
import { COST_LEGEND, COSTS, GRADE_STYLE, PHASES, type Cost, type Phase } from "@/lib/discovery/assessment";
import { photoUrl } from "@/lib/discovery/paths";
import { photoSrc } from "@/lib/discovery/photo-variants";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { PrintButton } from "@/components/discovery/print-button";
import { GenerateNarrativeButton } from "@/components/discovery/assessment-controls";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
// The "Write summary" server action runs in this page's function; Claude takes ~30-60s.
export const maxDuration = 300;
export const metadata = { title: "Site assessment" };

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
  const { data, assessment: a, narrative } = await loadSiteAssessment(project);
  const n = narrative?.content;
  const impacts = new Map(n?.area_impacts.map((i) => [i.area, i.impact]));
  const areaTitle = new Map(a.areas.map((x) => [x.key as string, x.title]));

  // AI roadmap when written; otherwise fall back to the logged risks.
  const roadmap: Array<{ title: string; why: string; area: string; phase: Phase; cost: Cost | null }> = n
    ? n.roadmap.map((r) => ({ ...r, area: areaTitle.get(r.area) ?? r.area }))
    : a.risks.map((r) => ({ title: r.risk, why: "", area: r.area, phase: LEVEL_PHASE[r.level] ?? "Next 90 days", cost: null }));

  const evidence = EVIDENCE.flatMap((k) => {
    const p = data.photoRows.find((x) => x.questionKey === k);
    return p ? [p] : [];
  }).slice(0, 6);

  const aiReady = isAiConfigured();

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16 print:max-w-none print:space-y-6 print:text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/discovery/${project.id}`} className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" /> {project.name}
        </Link>
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
          <span className={cn("flex size-20 items-center justify-center rounded-2xl text-5xl font-black", GRADE_STYLE[a.grade])}>
            {a.grade}
          </span>
          <span className="text-sm leading-tight text-muted-foreground">
            Overall
            <br />
            <span className="text-2xl font-bold text-foreground tabular-nums">{a.score}</span>/100
          </span>
        </div>
      </header>

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
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg text-2xl font-black", GRADE_STYLE[x.grade])}>
                  {x.grade}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{x.title}</p>
                  <p className="text-xs text-muted-foreground">{x.blurb}</p>
                </div>
              </div>
              {impacts.get(x.key) && <p className="mt-2.5 text-sm font-medium">{impacts.get(x.key)}</p>}
              {x.findings.length ? (
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {x.findings.map((f) => (
                    <li key={f.text}>{f.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">No issues found on the walk.</p>
              )}
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

      {evidence.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xl font-bold">From the site walk</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {evidence.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={photoSrc(photoUrl(project.id, p.id), "md")}
                alt=""
                className="aspect-[4/3] w-full break-inside-avoid rounded-lg border border-border object-cover"
              />
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
