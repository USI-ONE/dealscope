/**
 * Reports — every output for a walk in one place: the client assessment,
 * the install team brief, the full data report, the Excel export and the
 * network topology.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartColumn, ChevronRight, FileSpreadsheet, FileText, HardHat, Network } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { gradeBadge } from "@/lib/discovery/assessment";
import { loadSiteAssessment } from "@/lib/discovery/assessment-store";
import { getProject } from "@/lib/discovery/load";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reports" };

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireRole("member");
  const project = await getProject(id, ctx.organization.id);
  if (!project) notFound();
  const { assessment: a, narrative } = await loadSiteAssessment(project);
  const base = `/discovery/${project.id}`;

  const cards = [
    {
      href: `${base}/assessment`,
      icon: ChartColumn,
      tone: "text-violet-600 bg-violet-500/10",
      title: "Client assessment",
      who: "For the client",
      body: "Grades, plain-English findings, business impact and a phased roadmap with cost bands.",
      meta: narrative ? (narrative.stale ? "Summary out of date" : "Summary written") : "Summary not written yet",
      badge: gradeBadge(a),
    },
    {
      href: `${base}/install`,
      icon: HardHat,
      tone: "text-emerald-600 bg-emerald-500/10",
      title: "Install team brief",
      who: "For the crew",
      body: "Access and contacts, hazards, issues, scope of work, as-found network and what to confirm before the trip.",
      meta: `${a.risks.length} risks · ${a.workItems.length} items · ${a.drops} drops`,
    },
    {
      href: `${base}/report`,
      icon: FileText,
      tone: "text-sky-600 bg-sky-500/10",
      title: "Full site report",
      who: "Everything captured",
      body: "Every answer, inventory table and photo from the walk, section by section.",
    },
    {
      href: `${base}/export.xlsx`,
      icon: FileSpreadsheet,
      tone: "text-green-700 bg-green-600/10",
      title: "Excel export",
      who: "For analysis",
      body: "Answers, inventory and photo links as a workbook.",
      download: true,
    },
    {
      href: `${base}/topology`,
      icon: Network,
      tone: "text-indigo-600 bg-indigo-500/10",
      title: "Network topology",
      who: "Diagrams",
      body: "Diagrams read from controller screenshots, whiteboards or marked-up floor plans.",
    },
  ];

  return (
    <div className="grid gap-3 pb-12 sm:grid-cols-2">
      {cards.map((c) => {
        const Icon = c.icon;
        const inner = (
          <>
            <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", c.tone)}>
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.who}</span>
              <span className="block text-[17px] font-semibold">{c.title}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">{c.body}</span>
              {c.meta && <span className="mt-1.5 block text-xs font-medium text-muted-foreground">{c.meta}</span>}
            </span>
            {"badge" in c && c.badge ? (
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg text-xl font-black", c.badge.className)}>
                {c.badge.text}
              </span>
            ) : (
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            )}
          </>
        );
        const cls = "flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-foreground/20 active:scale-[0.99]";
        return c.download ? (
          <a key={c.title} href={c.href} className={cls}>
            {inner}
          </a>
        ) : (
          <Link key={c.title} href={c.href} className={cls}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
