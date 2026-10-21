/**
 * Multi-site portfolio — every selected branch side by side.
 *
 * Grade grid (site × area), the findings that repeat across branches,
 * totals, and a Claude-written summary with company-wide standards and a
 * rollout order. Sites are chosen in the URL (?ids=a,b,c); by default it
 * takes every walk that's in review or complete.
 */
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/db";
import { discoveryProjects, DISCOVERY_STATUS_LABEL } from "@/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { isAiConfigured } from "@/lib/ai/anthropic";
import { AREAS, GRADE_STYLE, toGrade } from "@/lib/discovery/assessment";
import { loadPortfolio } from "@/lib/discovery/assessment-store";
import { PrintButton } from "@/components/discovery/print-button";
import { GenerateNarrativeButton, PortfolioPicker } from "@/components/discovery/assessment-controls";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio assessment" };

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids: idsParam } = await searchParams;
  const ctx = await requireRole("member");

  const walks = await db
    .select({ id: discoveryProjects.id, name: discoveryProjects.name, status: discoveryProjects.status })
    .from(discoveryProjects)
    .where(and(eq(discoveryProjects.organizationId, ctx.organization.id), isNull(discoveryProjects.archivedAt)))
    .orderBy(discoveryProjects.name);
  const valid = new Set(walks.map((w) => w.id));
  const requested = (idsParam ?? "").split(",").filter((x) => valid.has(x));
  const ids = requested.length
    ? requested
    : walks.filter((w) => w.status === "review" || w.status === "complete").map((w) => w.id);

  const { sites, assessments, narrative, customer } = await loadPortfolio(ctx.organization.id, ids);
  const n = narrative?.content;
  const areaTitle = new Map(AREAS.map((a) => [a.key as string, a.title]));

  const avg = assessments.length ? Math.round(assessments.reduce((s, a) => s + a.score, 0) / assessments.length) : 0;
  const totalRisks = assessments.reduce((s, a) => s + a.risks.length, 0);
  const highRisks = assessments.reduce((s, a) => s + a.risks.filter((r) => r.level === "Blocker" || r.level === "High").length, 0);
  const totalDrops = assessments.reduce((s, a) => s + a.drops, 0);
  const totalWork = assessments.reduce((s, a) => s + a.workItems.length, 0);

  // Findings that repeat across branches, most widespread first.
  const common = new Map<string, Set<string>>();
  for (const a of assessments)
    for (const area of a.areas) for (const f of area.findings) common.set(f.text, (common.get(f.text) ?? new Set()).add(a.site));
  const repeated = [...common.entries()].filter(([, s]) => s.size >= 2).sort((x, y) => y[1].size - x[1].size).slice(0, 10);

  const roadmapCounts = sites
    .map((s) => s.narrative?.content.roadmap ?? [])
    .flat()
    .reduce<Record<string, number>>((acc, r) => ((acc[r.phase] = (acc[r.phase] ?? 0) + 1), acc), {});

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16 print:max-w-none print:space-y-6 print:text-[11px]">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/discovery" className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground">
          <ChevronLeft className="size-4" /> Site discovery
        </Link>
        <div className="flex flex-wrap gap-2">
          {isAiConfigured() && assessments.length >= 2 && (
            <GenerateNarrativeButton
              projectIds={ids}
              label={!n ? "Write portfolio summary" : narrative?.stale ? "Refresh summary (sites changed)" : "Rewrite summary"}
              variant={!n || narrative?.stale ? "primary" : "subtle"}
            />
          )}
          <PrintButton />
        </div>
      </div>

      <PortfolioPicker
        options={walks.map((w) => ({ id: w.id, name: w.name, status: DISCOVERY_STATUS_LABEL[w.status] }))}
        selected={ids}
      />

      {assessments.length < 2 ? (
        <p className="text-sm text-muted-foreground">Pick at least two site walks to compare.</p>
      ) : (
        <>
          <header className="flex flex-col gap-5 border-b-4 border-foreground pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">IT portfolio assessment</p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{customer || "Multi-site assessment"}</h1>
              <p className="text-[15px]">
                {assessments.length} sites · {totalRisks} risks ({highRisks} high or blocker) · {totalWork} items to replace / remove
                {totalDrops ? ` · ${totalDrops} new cable drops` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("flex size-20 items-center justify-center rounded-2xl text-5xl font-black", GRADE_STYLE[toGrade(avg)])}>
                {toGrade(avg)}
              </span>
              <span className="text-sm leading-tight text-muted-foreground">
                Portfolio average
                <br />
                <span className="text-2xl font-bold text-foreground tabular-nums">{avg}</span>/100
              </span>
            </div>
          </header>

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
                  <p className="text-xs text-amber-600 print:hidden">Sites have changed since this summary was written — refresh it.</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Use “Write portfolio summary” above for a plain-English summary, company-wide standards and a rollout order.
              </p>
            )}
          </section>

          {/* Grade grid */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold">Sites at a glance</h2>
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Site</th>
                    <th className="px-1 py-2 text-center font-medium">Overall</th>
                    {AREAS.map((a) => (
                      <th key={a.key} className="px-1 py-2 text-center font-medium leading-tight">
                        {a.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((s) => (
                    <tr key={s.projectId} className="border-t border-border/70">
                      <td className="py-1.5 pr-3">
                        <Link href={`/discovery/${s.projectId}/assessment`} className="font-medium hover:underline">
                          {s.site}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {s.risks.length} risks · {s.workItems.length} items
                        </span>
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <span className={cn("inline-flex size-9 items-center justify-center rounded-md text-lg font-black", GRADE_STYLE[s.grade])}>
                          {s.grade}
                        </span>
                      </td>
                      {s.areas.map((a) => (
                        <td key={a.key} className="px-1 py-1.5 text-center">
                          <span
                            title={a.findings.map((f) => f.text).join("\n")}
                            className={cn("inline-flex size-8 items-center justify-center rounded-md text-sm font-bold", GRADE_STYLE[a.grade])}
                          >
                            {a.grade}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {repeated.length > 0 && (
            <section className="space-y-2 break-inside-avoid">
              <h2 className="text-xl font-bold">Found at more than one site</h2>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {repeated.map(([text, set]) => (
                    <tr key={text} className="border-b border-border/60 align-top">
                      <td className="w-16 py-1.5 pr-2 font-bold tabular-nums">
                        {set.size}/{assessments.length}
                      </td>
                      <td className="py-1.5 pr-2">{text}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{[...set].join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {n && n.common_issues.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xl font-bold">Common issues and what to do</h2>
              <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
                {n.common_issues.map((c) => (
                  <div key={c.issue} className="break-inside-avoid rounded-xl border border-border p-4">
                    <p className="font-semibold">{c.issue}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.sites.join(", ")}</p>
                    <p className="mt-2 text-sm">{c.recommendation}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {n && n.standards.length > 0 && (
            <section className="space-y-2 break-inside-avoid">
              <h2 className="text-xl font-bold">Company-wide standards</h2>
              <p className="text-sm text-muted-foreground">Run every branch the same way so it can be managed, supported and viewed centrally.</p>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {n.standards.map((s) => (
                    <tr key={s.standard} className="border-b border-border/60 align-top">
                      <td className="w-36 py-2 pr-3 text-xs font-semibold uppercase text-muted-foreground">{areaTitle.get(s.area) ?? s.area}</td>
                      <td className="py-2">
                        <span className="font-medium">{s.standard}</span>
                        <span className="block text-muted-foreground">{s.why}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {n && n.rollout.length > 0 && (
            <section className="space-y-2 break-inside-avoid">
              <h2 className="text-xl font-bold">Recommended rollout order</h2>
              <ol className="space-y-1.5">
                {n.rollout.map((r, i) => (
                  <li key={r.site} className="flex gap-3 text-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                      {i + 1}
                    </span>
                    <span>
                      <span className="font-semibold">{r.site}</span> — {r.why}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {Object.keys(roadmapCounts).length > 0 && (
            <p className="text-sm text-muted-foreground">
              Across the site roadmaps written so far:{" "}
              {Object.entries(roadmapCounts)
                .map(([p, c]) => `${c} “${p}”`)
                .join(" · ")}{" "}
              items.
            </p>
          )}

          {/* Per-site links */}
          <section className="space-y-2 print:hidden">
            <h2 className="text-xl font-bold">Site assessments</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {sites.map(({ assessment: s, narrative: sn }) => (
                <li key={s.projectId}>
                  <Link href={`/discovery/${s.projectId}/assessment`} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 active:bg-accent">
                    <span className={cn("flex size-9 items-center justify-center rounded-md text-lg font-black", GRADE_STYLE[s.grade])}>
                      {s.grade}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.site}</span>
                      <span className="block text-xs text-muted-foreground">
                        {sn ? (sn.stale ? "Summary out of date" : "Summary written") : "No summary yet"}
                      </span>
                    </span>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
